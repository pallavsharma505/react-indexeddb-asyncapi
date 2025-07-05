import typescript from "rollup-plugin-typescript2";

export default [
    // ESM build
    {
        input: "src/IndexedDBAsyncAPI.ts",
        output: {
            file: "dist/index.esm.js",
            format: "esm",
        },
        plugins: [typescript({ useTsconfigDeclarationDir: true })],
    },
    // CJS build
    {
        input: "src/IndexedDBAsyncAPI.ts",
        output: {
            file: "dist/index.cjs.js",
            format: "cjs",
            exports: "default",
        },
        plugins: [typescript({ useTsconfigDeclarationDir: true })],
    },
];
