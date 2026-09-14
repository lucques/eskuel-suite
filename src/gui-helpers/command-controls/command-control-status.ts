import type { CommandStatus } from '../../session-command';

export type CommandControlStatus = 'idle' | 'running' | 'rebuilding-after-cancellation';

export function getCommandControlStatus<Command>(
    commandStatus: CommandStatus<Command>,
    isTargetCommand: (command: Command) => boolean,
): CommandControlStatus {
    switch (commandStatus.kind) {
        case 'idle':
            return 'idle';
        case 'running':
            return isTargetCommand(commandStatus.command) ? 'running' : 'idle';
        case 'rebuilding-after-cancellation':
            return isTargetCommand(commandStatus.cancelledCommand) ? 'rebuilding-after-cancellation' : 'idle';
        default: { const _n: never = commandStatus; return _n; }
    }
}
