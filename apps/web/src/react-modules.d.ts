interface ElementProps {
  [prop: string]: unknown;
  children?: unknown;
  key?: string | number;
  ref?: unknown;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
}

declare module "react" {
  export type ReactNode = unknown;
  export function useState<S>(
    initial: S | (() => S),
  ): [S, (value: S | ((previous: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(value: T): { current: T };
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function StrictMode(props: { children?: ReactNode }): ReactNode;
}

declare module "react/jsx-runtime" {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: string): unknown;
  export function jsxs(type: unknown, props: unknown, key?: string): unknown;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): {
    render(children: unknown): void;
  };
}

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: ElementProps;
  }
}
