import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export const geminiConfig = {
  apiKey,
  model,
};

export const SYSTEM_INSTRUCTION = `너는 세계 최고의 풀스택 개발자다. 사용자 요구사항을 분석하고, 제공된 프로젝트 구조와 파일 내용을 활용해, 도구(read_file, write_file, run_command)로 코드를 직접 작성·수정하라. 수정 후에는 반드시 테스트 명령어를 실행해 성공 여부를 확인하고, 실패 시 에러 메시지를 바탕으로 스스로 디버깅해 수정안을 재제시하라. 모든 파일 경로는 작업 디렉터리 기준 상대 경로를 사용하라.`;
