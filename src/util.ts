// Generic Success/Fail for return types
export type Success<T> = { ok: true,  data: T }
export type Fail<E>    = { ok: false, error: E }

// Type guard to check if a result is a Success/Fail
export function isSuccess<T>(result: Success<T> | Fail<any>): result is Success<T> {
    return result.ok;
}
export function isFail<E>(result: Success<any> | Fail<E>): result is Fail<E> {
    return !result.ok;
}

// Standard assert
export function assert(condition: boolean, message?: string): asserts condition {
    if (!condition) {
        throw new Error(`Assertion failed: ${message ?? ''}`);
    }
}


// Reorder a list
export function reorder<T,>(list: T[], startIndex: number, endIndex: number): T[] {
    const result: T[] = Array.from(list);
    const [removed]: T[] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
  
    return result;
};


// Generate unique ids
let nextId = 0;
export function generateId(): number {
    return nextId++;
}

// Files and where they come from
export type FileSource =
  | { type: "fetch";  url: string     }
  | { type: "inline"; content: string };

export type NamedFileSource = FileSource & { name: string };

export type FetchFail = { kind: 'fetch', url: string }

// Materialize file source
export function materializeFileSource(source: FileSource): Promise<Success<string> | Fail<FetchFail>> {
    // Fetch
    if (source.type === 'fetch') {
        return fetch(source.url)
            .then(response => {
                // Success
                if (response.ok) {
                    return response.text().then((sql) => {
                        return { ok: true, data: sql};
                    });
                }
                // Fail
                else {
                    return { ok: false, error: { kind: 'fetch', url: source.url } };
                }
            });
    }
    // Inline
    else {
        return Promise.resolve({
            ok: true,
            data: source.content
        });
    }
}


export function getFilenameWithoutExtension(path: string): string {
    // Extract the filename from the path
    const basename = path.split('/').reverse()[0];
    
    // Remove the file extension
    const filenameWithoutExtension = basename.split('.').slice(0, -1).join('.');
  
    // Handle cases where the file might not have an extension
    return filenameWithoutExtension || basename;
  }