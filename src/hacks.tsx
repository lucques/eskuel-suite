import React from "react";
import { useEffect, useState } from "react";
import { Droppable, DroppableProps } from "react-beautiful-dnd";

// Hack to make StrictMode work with react-beautiful-dnd
// Credits to Ulisesx21 here: https://github.com/atlassian/react-beautiful-dnd/issues/2407#issuecomment-1648339464
// TODO: Remove this hack when react-beautiful-dnd is updated to support StrictMode
export const StrictModeDroppable = ({ children, ...props }: DroppableProps) => {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => {
        const animation = requestAnimationFrame(() => setEnabled(true));
        return () => {
            cancelAnimationFrame(animation);
            setEnabled(false);
        };
    }, []);
    if (!enabled) {
        return null;
    }
    return <Droppable {...props}>{children}</Droppable>
};