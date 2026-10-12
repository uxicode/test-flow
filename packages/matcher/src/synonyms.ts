/**
 * 레이블 동의어 맵 (조정 가능).
 *
 * key   : 정규화된 대표 레이블 (소문자, 공백 정규화, 접미사 제거 후 형태)
 * values: 동의어 배열 (같은 정규화 형태)
 *
 * 이 파일을 직접 수정하여 프로젝트에 맞게 매칭 규칙을 조정하세요.
 */
export const LABEL_SYNONYMS: Record<string, string[]> = {
  이메일: ["email", "이메일 주소", "e-mail", "아이디", "계정", "email address", "로그인 아이디", "사용자 아이디", "id"],
  비밀번호: ["password", "패스워드", "비번", "pwd", "pass", "비밀번호 확인", "기존 비밀번호", "새 비밀번호"],
  이름: ["name", "성명", "성함", "username", "닉네임", "user name", "고객명", "회원명", "담당자명", "성명 이름"],
  상태: ["status", "상태값", "진행 상태", "처리 상태", "주문 상태", "결제 상태"],
  날짜: ["date", "일자", "기준일", "기간"],
  시작일: ["start date", "from", "시작 날짜", "from date"],
  종료일: ["end date", "to", "종료 날짜", "to date", "만료일"],
  검색어: ["keyword", "search", "검색 키워드", "키워드", "query", "검색어 입력"],
  주소: ["address", "주소 검색", "배송지", "배송 주소"],
  전화번호: ["phone", "tel", "연락처", "휴대폰", "핸드폰", "mobile", "phone number", "전화"],
  성별: ["gender", "sex"],
  생년월일: ["birth", "birthday", "birth date", "생일", "출생일"],
  직업: ["job", "occupation", "직종"],
  회사: ["company", "company name", "업체명", "기업명", "사업자명"],
  부서: ["department", "dept", "팀", "team"],
  역할: ["role", "권한", "권한 레벨", "사용자 역할"],
  금액: ["amount", "price", "가격", "요금", "결제 금액", "환불 금액"],
  수량: ["quantity", "count", "개수", "qty"],
  내용: ["content", "body", "description", "설명", "메모", "비고", "상세 내용"],
  제목: ["title", "subject", "제목"],
  카테고리: ["category", "분류", "유형", "종류"],
  조회기간: ["search period", "기간", "조회 기간", "검색 기간"],
  페이지: ["page", "page size", "목록 수", "표시 개수", "페이지당"],
};
