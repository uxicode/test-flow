import type { FigmaDump } from "./types.js";

export const SAMPLE_CHECKOUT_DUMP: FigmaDump = {
  fileKey: "sampleCheckoutFlow",
  startNodeId: "1:1",
  nodes: [
    { id: "1:1", name: "로그인", type: "FRAME", text: "이메일과 비밀번호로 로그인" },
    { id: "1:2", name: "상품 목록", type: "FRAME", text: "상품 카드 목록" },
    { id: "1:3", name: "장바구니", type: "FRAME", text: "담은 상품 확인" },
    { id: "1:4", name: "결제", type: "FRAME", text: "결제 수단 선택" },
    { id: "1:5", name: "완료", type: "FRAME", text: "주문 완료" },
    { id: "1:6", name: "로그인 실패", type: "FRAME", text: "오류 메시지 표시" },
  ],
  connections: [
    { from: "1:1", to: "1:2", label: "성공" },
    { from: "1:1", to: "1:6", label: "실패" },
    { from: "1:2", to: "1:3", label: "담기" },
    { from: "1:3", to: "1:4", label: "결제하기" },
    { from: "1:4", to: "1:5", label: "결제 성공" },
  ],
};
