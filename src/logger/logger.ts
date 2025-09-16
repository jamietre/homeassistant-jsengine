export type LogFn = (...args: any[]) => void;

export const logLevels = ['debug', 'info', 'error'] as const;
export type LogLevels = (typeof logLevels)[number];

export type Logger = {
    debug: LogFn;
    info: LogFn;
    error: LogFn;
};

export type LoggerOptions = {
    source: string;
};

export type LoggerFactory = (options: LoggerOptions) => Logger;

class ConsoleLogger implements Logger {
    constructor(private options: LoggerOptions) {}
    log(logLevel: LogLevels, ...args: any[]) {
        const stamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

        console.log(`[${stamp}] (${this.options.source})`, ...args);
    }

    debug(...args: any[]) {
        this.log('debug', ...args);
    }

    info(...args: any[]) {
        this.log('info', ...args);
    }

    error(...args: any[]) {
        this.log('error', ...args);
    }
}

export const getLogger: LoggerFactory = (options: LoggerOptions) => {
    return new ConsoleLogger(options);
};
