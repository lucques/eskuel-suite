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
export type RawSource<T> =
  | { type: 'fetch';  url: string; }
  | { type: 'inline'; content: T };
export type Named<T> = T & { name: string };

export type FetchFail = { kind: 'fetch', url: string }


export function materializeTextSource(source: RawSource<string>): Promise<Success<string> | Fail<FetchFail>> {
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

export function materializeBinarySource(source: RawSource<Uint8Array>): Promise<Success<Uint8Array> | Fail<FetchFail>> {
    // Fetch
    if (source.type === 'fetch') {
        return fetch(source.url)
            .then(response => {
                // Success
                if (response.ok) {
                    return response.arrayBuffer().then((buf) => {
                        return { ok: true, data: new Uint8Array(buf)};
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

// Return `null` if filename has no extension
export function getFilenameExtension(path: string): string | null {
    const basename = path.split('/').reverse()[0];
    const tokens = basename.split('.');
    return tokens.length > 1 ? tokens[tokens.length - 1] : null;
}


// Base64 encoding/decoding
export function encodeToBase64(uint8Array: Uint8Array): string {
    // Convert Uint8Array to a binary string
    const binaryString = String.fromCharCode(...uint8Array);
    
    // Convert the binary string to a Base64 encoded string
    return btoa(binaryString); // btoa() encodes to Base64
}

export function decodeFromBase64(base64String: string): Uint8Array {
    // Decode the Base64 string to a binary string
    const binaryString = atob(base64String);
    
    // Convert the binary string to a Uint8Array
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    
    return uint8Array;
}
