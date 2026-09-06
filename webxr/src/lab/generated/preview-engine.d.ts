export interface PreviewEngineModule {
  ccall(name: string, returnType: "number" | "string", argTypes: ("number" | "string")[], args: (number | string)[]): number | string;
}
/** Generated, embedded Wasm. Rebuild with tools/build_preview_engine.ps1. */
export default function createPreviewEngineModule(): Promise<PreviewEngineModule>;
