# OCR Workflow

## 목적

문서 기반 TC 생성 기능에서 PDF 내 텍스트를 안정적으로 확보하기 위한 OCR 보정 흐름이다. 기본적으로는 PDF.js의 텍스트 레이어 추출을 우선 사용하고, 추출 결과가 비어 있거나 품질이 낮은 페이지에 한해 브라우저에서 Tesseract.js OCR을 수행한다.

## 적용 범위

- 대상 화면: `문서로 TC 만들기` 모달
- 지원 문서: PDF, DOCX, HWPX, MD, TXT
- OCR 적용 문서: PDF
- OCR 실행 위치: 브라우저
- OCR 엔진: Tesseract.js
- 지원 OCR 언어:
  - 한국어 + 영어: `kor+eng`
  - 영어: `eng`

## 전체 흐름

1. 사용자가 `문서로 TC 만들기` 모달을 연다.
2. PDF, DOCX, HWPX, MD, TXT 파일 중 하나를 업로드한다.
3. 생성 옵션을 선택한다.
   - 부정 케이스 포함 여부
   - 경계 값 케이스 포함 여부
   - 요구사항당 최대 TC 수
   - OCR 언어
4. 사용자가 `TC 생성`을 실행한다.
5. 문서 타입을 판별한다.
6. 문서 타입별 텍스트 추출을 수행한다.
7. PDF인 경우 페이지별로 OCR 필요 여부를 판단한다.
8. 추출된 텍스트를 요구사항으로 분석한다.
9. 요구사항 기반 TC 초안을 생성한다.
10. 결과를 화면에 표시하고 히스토리에 저장한다.
11. 사용자는 결과를 현재 시나리오에 반영하거나 새 시나리오로 생성한다.

## 문서 타입별 처리

| 문서 타입 | 처리 방식 | OCR 사용 |
| --- | --- | --- |
| PDF | PDF.js로 페이지별 텍스트 추출 후 품질이 낮은 페이지에 OCR fallback 적용 | 예 |
| DOCX | mammoth로 raw text 추출 | 아니오 |
| HWPX | HWPX 내부 텍스트 추출 | 아니오 |
| MD | plain text 읽기 | 아니오 |
| TXT | plain text 읽기 | 아니오 |

## PDF OCR 상세 흐름

1. PDF 파일을 `Uint8Array`로 읽는다.
2. PDF.js로 문서를 로드한다.
3. 전체 페이지 수를 확인한다.
4. 각 페이지에 대해 다음 과정을 반복한다.
   - 진행 상태를 `extracting`으로 갱신한다.
   - `page.getTextContent()`로 텍스트 레이어를 추출한다.
   - 추출 텍스트를 정리한다.
   - 텍스트 품질 점수를 계산한다.
   - OCR 필요 여부를 판단한다.
   - OCR이 필요하면 페이지를 canvas로 렌더링한다.
   - canvas 이미지를 Tesseract.js로 인식한다.
   - OCR 결과가 기존 추출 텍스트보다 길면 OCR 결과를 사용한다.
   - 그렇지 않으면 기존 추출 텍스트를 유지한다.
5. 페이지별 텍스트를 합쳐 최종 문서 텍스트를 만든다.

## OCR 수행 조건

PDF 페이지에서 아래 조건 중 하나라도 만족하면 OCR을 수행한다.

- 정리된 추출 텍스트 길이가 24자 미만
- 텍스트 품질 점수가 0.25 미만

텍스트 품질 점수는 한글, 영문, 출력 가능한 문자 비율과 제어 문자 비율을 기준으로 계산한다. 이 기준은 스캔본 PDF, 깨진 텍스트 레이어, 이미지 기반 PDF를 감지하기 위한 것이다.

## OCR 언어 선택

사용자가 모달에서 선택한 OCR 언어는 Tesseract worker 생성 시 반영된다.

| 사용자 옵션 | Tesseract 언어 |
| --- | --- |
| 한국어 + 영어 | `kor+eng` |
| 영어 | `eng` |

같은 언어 옵션을 반복 사용할 경우 기존 Tesseract worker를 재사용한다. 다른 언어로 변경되면 기존 worker를 종료하고 새 worker를 생성한다.

## 진행 상태

화면에는 다음 상태가 표시된다.

| 상태 | 의미 |
| --- | --- |
| `extracting` | 문서 파싱 또는 텍스트 추출 중 |
| `ocr` | PDF 페이지 OCR 인식 중 |
| `requirements` | 추출 텍스트를 요구사항으로 분석 중 |
| `testcases` | 요구사항 기반 TC 생성 중 |
| `done` | 처리 완료 |
| `error` | 처리 실패 |

PDF 처리 중에는 현재 페이지와 전체 페이지 수를 함께 표시한다.

## 실패 및 예외 처리

- 지원하지 않는 문서 형식이면 오류를 표시한다.
- PDF 텍스트 추출이 실패한 페이지는 warning에 기록하고 OCR 판단을 계속한다.
- OCR이 실패한 페이지는 warning에 기록하고 기존 추출 텍스트를 사용한다.
- 전체 추출 결과가 비어 있으면 TC 생성을 중단하고 오류를 표시한다.
- 모달이 unmount되면 Tesseract worker를 종료한다.

## 결과 처리

OCR 또는 일반 추출로 확보한 문서 텍스트는 다음 단계로 전달된다.

1. `extractRequirements`가 문서 텍스트에서 요구사항 후보를 추출한다.
2. `generateTestCases`가 옵션에 맞춰 TC 초안을 생성한다.
3. 결과에는 원본 문서 정보, 추출 텍스트, 요구사항, TC, warning이 포함된다.
4. 결과는 문서 TC 히스토리에 저장된다.
5. 사용자는 생성된 TC를 현재 시나리오에 추가하거나 새 시나리오로 만들 수 있다.

## 구현 위치

- 모달 및 사용자 흐름: `apps/web/src/components/DocTcModal.tsx`
- 문서 타입 판별 및 추출 분기: `apps/web/src/services/doc-tc/extractors/index.ts`
- PDF 텍스트 추출 및 OCR fallback: `apps/web/src/services/doc-tc/extractors/pdf.ts`
- OCR worker 관리: `apps/web/src/services/doc-tc/ocr.ts`
- 텍스트 품질 평가: `apps/web/src/services/doc-tc/textQuality.ts`
- 요구사항 추출: `apps/web/src/services/doc-tc/extractRequirements.ts`
- TC 생성: `apps/web/src/services/doc-tc/generateTestCases.ts`

## 운영 메모

- OCR은 브라우저에서 수행되므로 서버 API나 외부 OCR API 호출이 필요 없다.
- 스캔본 PDF는 처리 시간이 길어질 수 있다.
- 한국어 문서가 많은 경우 기본 OCR 언어는 `한국어 + 영어`를 사용한다.
- OCR 품질은 PDF 렌더링 스케일, 원본 해상도, 문서 대비, 글꼴 상태의 영향을 받는다.
