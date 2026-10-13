export {
  CONTROL_KIND,
  parseControlKind,
  type ControlKind,
} from "./control-kind.js";
export {
  defaultOptionValue,
  inferControlKind,
  parseOptionList,
} from "./infer-control.js";
export {
  buildTestCases,
  shouldSplitByFunction,
  canonicalTarget,
  deriveFailureExample,
  failureInputValue,
  isEmptyFieldWarning,
  TC_KIND,
  type LocatorStrategy,
  type TcInput,
  type TcKind,
  type TcTableAssert,
  type TestCase,
} from "./build-test-cases.js";
export { casesToMarkdown, casesToXlsx } from "./export-document.js";
export {
  TC_FILE_VERSION,
  saveTcFile,
  loadTcFile,
  listTcFiles,
  deleteTcFile,
  type TcFile,
  type TcFileMeta,
} from "./tc-file.js";
