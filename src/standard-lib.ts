////////////////////
// React: Context //
////////////////////

import { Context, useContext } from "react";
import { assert } from "./util";

export function useContextOrDie<A>(context: Context<A | null>): A {
    const value = useContext(context);
    assert(value !== null);
    return value;
}