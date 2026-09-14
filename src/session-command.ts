export type CommandStatus<Command> =
    | { kind: 'idle' }
    | {
        kind: 'running',
        command: Command,
    }
    | {
        kind: 'rebuilding-after-cancellation',
        cancelledCommand: Command,
    };
