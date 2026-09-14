import { playerCommands } from '../../src/apps/game-console/player';
import type { PlayerCommand } from '../../src/apps/game-console/player';

export const PLAY_COMMAND_HELP = `Commands:
  look                 Show the current scene and available actions.
  schema               Show the database schema.
  sql <SQL>            Execute SQL, including batches; submit an answer on an unsolved task.
  next / previous      Navigate using the console's navigation rules.
  skip                 Skip the current unsolved task.
  hint                 Reveal the next ordinary hint.
  solution             Reveal a solution hint when available, or the sample solution after solving.
  reset-hints          Reset the current scene's hints, including a used solution hint.
  reset-db             Reconstruct the database at the current scene, as in the console.
  restart              Start the game over with fresh databases.
  results              Show all retained results (newest first).
  remove-result <id>   Dismiss a result.
  about                Show game and package information.
  cancel               Cancel running SQL or a hint and reconstruct the databases.
  help / quit          Show commands or close the session.

Input is one command per line. JSON requests are also accepted:
  {"command":"sql","sql":"SELECT\\n    * FROM example;"}
  {"command":"remove-result","id":0}
Keep stdin open to retain the live session. EOF closes it. Ctrl-C cancels a
cancellable operation; otherwise it exits. --json emits JSON Lines on stdout.
`;

export function parsePlayCommand(line: string): PlayerCommand {
    const trimmed = line.trim();
    let value: unknown;
    if (trimmed.startsWith('{')) {
        value = JSON.parse(trimmed);
    }
    else {
        const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
        const command = match?.[1];
        const argument = match?.[2];
        if (command === 'sql') {
            value = { command, sql: argument };
        }
        else if (command === 'remove-result') {
            value = { command, id: argument === undefined ? undefined : Number(argument) };
        }
        else if (argument !== undefined) {
            throw new Error(`'${command}' does not accept arguments`);
        }
        else {
            value = { command };
        }
    }
    if (typeof value !== 'object' || value === null || !('command' in value)
        || typeof value.command !== 'string' || !playerCommands.some(command => command === value.command)) {
        throw new Error('Unknown command. Use help to list commands.');
    }
    else {
        const allowedKeys = value.command === 'sql' ? ['command', 'sql']
            : value.command === 'remove-result' ? ['command', 'id'] : ['command'];
        if (Object.keys(value).some(key => !allowedKeys.includes(key))) {
            throw new Error(`Unexpected argument for '${value.command}'`);
        }
        else if (value.command === 'sql' && (!('sql' in value) || typeof value.sql !== 'string' || value.sql.trim() === '')) {
            throw new Error('sql requires a nonempty SQL string');
        }
        else if (value.command === 'remove-result' && (!('id' in value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 0)) {
            throw new Error('remove-result requires a nonnegative integer id');
        }
        else {
            return value as PlayerCommand;
        }
    }
}
