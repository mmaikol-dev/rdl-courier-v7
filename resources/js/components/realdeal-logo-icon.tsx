import { SVGAttributes } from 'react';

export default function RealDealLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none">
            {/* Cargo body */}
            <rect x="4" y="11" width="24" height="25" rx="4" fill="currentColor" opacity="0.9" />
            {/* Cargo cutout showing goods */}
            <rect x="8" y="16" width="8" height="8" rx="1.5" fill="white" opacity="0.85" />
            <rect x="18" y="16" width="5" height="8" rx="1.5" fill="white" opacity="0.45" />
            {/* Cab */}
            <path d="M28 18H34.5C36.433 18 38 19.567 38 21.5V32.5C38 34.433 36.433 36 34.5 36H28V18Z" fill="currentColor" opacity="0.55" />
            {/* Forward motion chevrons */}
            <path d="M36 6 L40 10 L36 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M42 6 L46 10 L42 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            {/* Wheels */}
            <circle cx="13" cy="38" r="4" fill="currentColor" />
            <circle cx="13" cy="38" r="1.6" fill="white" opacity="0.9" />
            <circle cx="32.5" cy="38" r="4" fill="currentColor" />
            <circle cx="32.5" cy="38" r="1.6" fill="white" opacity="0.9" />
        </svg>
    );
}
