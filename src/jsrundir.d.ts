declare module 'jsrundir' {
    class RunDir {
        constructor(path: string);
        on(event: 'load' | 'unload', callback: (name: string, module: any) => void): this;
        run(): void;
        stop(): void;
    }
    export default RunDir;
}
