export type EsModule<T> = {
    __esModule: true;
    default: T;
};
export type ModuleExport<T> = T | EsModule<T>;

export function isEsModule<T>(mod: ModuleExport<T>): mod is EsModule<T> {
    return (mod as EsModule<T>)?.__esModule === true;
}
