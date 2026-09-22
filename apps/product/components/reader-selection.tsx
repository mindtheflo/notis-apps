import {NotisSelectionBoundary,type ContextResource} from '@notis/sdk';
import type {ReactNode} from 'react';
/** Keep non-editable reader text a focused copy target inside the SDK boundary. */
export function ReaderSelection({resource,children,className}:{resource:ContextResource|null;children:ReactNode;className?:string}){return <NotisSelectionBoundary resource={resource} className={className}><div tabIndex={-1} onMouseDownCapture={event=>{const target=event.target as HTMLElement;if(!target.closest('button,a,input,textarea,select,summary,[contenteditable]'))event.currentTarget.focus({preventScroll:true});}}>{children}</div></NotisSelectionBoundary>;}
