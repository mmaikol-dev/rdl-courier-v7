import { sileo } from 'sileo';
import type { ReactNode } from 'react';
import type { SileoOptions, SileoPosition } from 'sileo';

type ToastOptions = {
    id?: string | number;
    duration?: number;
    description?: ReactNode;
    position?: SileoPosition;
    [key: string]: unknown;
};

let toastSequence = 0;

function notify(type: 'success' | 'error' | 'warning' | 'info', message: ReactNode, options: ToastOptions = {}) {
    const id = options.id === undefined ? `app-toast-${++toastSequence}` : String(options.id);
    const result = sileo[type]({
        title: type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Information',
        description: message,
        duration: options.duration === Number.POSITIVE_INFINITY ? null : options.duration,
        fill: 'var(--primary)',
        position: options.position,
        id,
    } as SileoOptions & { id: string });
    return result;
}

function showLoading(message: ReactNode, options: ToastOptions = {}) {
    const id = options.id === undefined ? `app-toast-${++toastSequence}` : String(options.id);
    return sileo.show({
        type: 'loading',
        title: 'Loading',
        description: message,
        duration: null,
        fill: 'var(--primary)',
        id,
    } as SileoOptions & { id: string });
}

export const toast = {
    success: (message: ReactNode, options?: ToastOptions) => notify('success', message, options),
    error: (message: ReactNode, options?: ToastOptions) => notify('error', message, options),
    warning: (message: ReactNode, options?: ToastOptions) => notify('warning', message, options),
    info: (message: ReactNode, options?: ToastOptions) => notify('info', message, options),
    loading: showLoading,
    dismiss: (id?: string | number) => {
        if (id !== undefined) sileo.dismiss(String(id));
        else sileo.clear();
    },
};
