import typescript from "rollup-plugin-typescript2";

export default [
    // ESM build
    {
        input: "src/index.ts",
        output: {
            file: "dist/index.esm.js",
            format: "esm",
        },
        plugins: [
            typescript({
                declaration: true,
                declarationDir: "dist",
                rootDir: "src"
            })
        ],
    },
    // CJS build
    {
        input: "src/index.ts",
        output: {
            file: "dist/index.cjs.js",
            format: "cjs",
            exports: "named",
        },
        plugins: [
            typescript({
                declaration: true,
                declarationDir: "dist",
                rootDir: "src"
            })
        ],
    },
];
