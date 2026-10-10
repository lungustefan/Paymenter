export type CommandFn = (args: string[], flags: Record<string, string | boolean>) => Promise<void> | void;

export interface Command {
    description: string;
    run: CommandFn;
}

export const commands: Record<string, Command> = {};

export function register(name: string, description: string, run: CommandFn) {
    commands[name] = { description, run };
}
