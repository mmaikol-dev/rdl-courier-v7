import * as React from 'react';

interface BrandLogoProps {
    className?: string;
}

export default function BrandLogo({ className }: BrandLogoProps) {
    return (
        <svg viewBox="0 0 56 44" xmlns="http://www.w3.org/2000/svg" fill="none" className={className}>
            <defs>
                <linearGradient id="rdl-body" x1="2" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fb923c" />
                    <stop offset="1" stopColor="#f97316" />
                </linearGradient>
                <linearGradient id="rdl-cab" x1="30" y1="12" x2="56" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#60a5fa" />
                    <stop offset="1" stopColor="#3b82f6" />
                </linearGradient>
            </defs>

            {/* Cargo body */}
            <rect x="2" y="8" width="30" height="25" rx="3.5" fill="url(#rdl-body)" />
            {/* Container lacing */}
            <line x1="12" y1="8" x2="12" y2="33" stroke="#7c2d12" strokeWidth="1" opacity="0.35" />
            <line x1="22" y1="8" x2="22" y2="33" stroke="#7c2d12" strokeWidth="1" opacity="0.35" />
            <rect x="6" y="12" width="3.5" height="3.5" rx="0.8" fill="#ffffff" opacity="0.85" />
            <rect x="14" y="17" width="4" height="4" rx="0.9" fill="#ffffff" opacity="0.6" />

            {/* Cab */}
            <path d="M30 12 H42 C47 12 49.6 14.4 50.6 18.6 L54 33 H30 V12 Z" fill="url(#rdl-cab)" />
            {/* Windshield */}
            <path d="M33.6 14.5 H39.4 C43 14.5 45 16.4 45.6 19.4 L48 31 H33.6 V14.5 Z" fill="#0b1b33" opacity="0.55" />
            {/* Motion chevrons */}
            <path d="M49 6 L53 10 L49 14" stroke="#f97316" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M55 5 L59 9 L55 13" stroke="#60a5fa" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />

            {/* Wheels */}
            <circle cx="14" cy="35" r="5" fill="#0f172a" />
            <circle cx="14" cy="35" r="1.8" fill="#f8fafc" opacity="0.9" />
            <circle cx="38" cy="35" r="5" fill="#0f172a" />
            <circle cx="38" cy="35" r="1.8" fill="#f8fafc" opacity="0.9" />
        </svg>
    );
}