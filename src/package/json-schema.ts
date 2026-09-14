import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

export function compileJsonSchema(
    schema: object,
    referencedSchemas: object[] = [],
): ValidateFunction {
    const ajv = new Ajv({
        allErrors: true,
        jsonPointers: true,
        schemaId: 'auto',
    });
    for (const referencedSchema of referencedSchemas) {
        ajv.addSchema(referencedSchema);
    }
    return ajv.compile(schema);
}

export function requireJsonSchema<T>(
    candidate: unknown,
    validate: ValidateFunction,
    context: string,
): T {
    const valid = validate(candidate);
    if (valid === true) {
        return candidate as T;
    }
    else if (valid === false) {
        const details = validate.errors?.map(error => formatError(error, context)).join('; ');
        throw new Error(details === undefined || details === ''
            ? `${context} does not conform to its JSON Schema`
            : details);
    }
    else {
        throw new Error(`${context} JSON Schema unexpectedly requires asynchronous validation`);
    }
}

function formatError(error: ErrorObject, context: string): string {
    const location = `${context}${error.dataPath}`;
    const additionalProperty = readStringParameter(error, 'additionalProperty');
    const missingProperty = readStringParameter(error, 'missingProperty');
    if (error.keyword === 'additionalProperties' && additionalProperty !== undefined) {
        return `${location} contains unknown property '${additionalProperty}'`;
    }
    else if (error.keyword === 'required' && missingProperty !== undefined) {
        return `${location} is missing required property '${missingProperty}'`;
    }
    else {
        return `${location} ${error.message ?? `violates ${error.keyword}`}`;
    }
}

function readStringParameter(error: ErrorObject, name: string): string | undefined {
    const value = (error.params as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
}
