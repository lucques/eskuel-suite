const THREE_PART_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function compareThreePartVersions(left: string, right: string): -1 | 0 | 1 {
    const leftParts = parseThreePartVersion(left);
    const rightParts = parseThreePartVersion(right);
    for (let index = 0; index < leftParts.length; index++) {
        if (leftParts[index] < rightParts[index]) {
            return -1;
        }
        else if (leftParts[index] > rightParts[index]) {
            return 1;
        }
    }
    return 0;
}

function parseThreePartVersion(value: string): [number, number, number] {
    if (!THREE_PART_VERSION_PATTERN.test(value)) {
        throw new TypeError(`Invalid three-part version: ${value}`);
    }
    const parts = value.split('.').map(part => Number(part));
    return [parts[0], parts[1], parts[2]];
}
