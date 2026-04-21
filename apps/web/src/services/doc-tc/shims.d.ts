declare module "mammoth" {
  export interface ExtractInput {
    arrayBuffer: ArrayBuffer;
  }
  export interface ExtractResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  export function extractRawText(input: ExtractInput): Promise<ExtractResult>;
  export function convertToHtml(input: ExtractInput): Promise<ExtractResult>;
  const mammoth: {
    extractRawText: typeof extractRawText;
    convertToHtml: typeof convertToHtml;
  };
  export default mammoth;
}
