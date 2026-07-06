import { LucideIcon } from 'lucide-react';
import type { Config } from 'ziggy-js';

export interface Auth {
    user: User;
    pendingLoginLocationCapture?: boolean;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    href: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface CountryData {
    id: number;
    name: string;
    code?: string | null;
    currency?: string | null;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    sidebar: {
        role?: string;
        visibleItems: string[];
        canManage: boolean;
    };
    ziggy: Config & { location: string };
    sidebarOpen: boolean;
    countries?: CountryData[];
    selectedCountry?: string | null;
    selectedCurrency?: string;
    productOptions?: string[];
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    roles?: string;
    country_id?: number | null;
    country?: {
        id: number;
        name: string;
        code?: string | null;
    } | null;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
