// HubFlow.tsx
"use client";

// Adapted from the ReactVibe motion component (MIT): https://github.com/siddhantmani/reactvibe
import React from "react";
import { motion } from "framer-motion";
import { Boxes, Package, Radio, Webhook } from "lucide-react";

const topInputNodes = [
    { id: "orders", name: "Orders", color: "var(--primary)", icon: <Package className="h-7 w-7" /> },
    { id: "products", name: "Products", color: "var(--primary)", icon: <Boxes className="h-7 w-7" /> },
    { id: "transfers", name: "Transfers", color: "var(--primary)", icon: <Radio className="h-7 w-7" /> },
    { id: "events", name: "Webhook events", color: "var(--primary)", icon: <Webhook className="h-7 w-7" /> },
];

const bottomOutputIcons = [
    { id: "merchant-app", name: "Merchant app", color: "var(--primary)", icon: <Package className="h-5 w-5" /> },
    { id: "dashboard", name: "Dashboard", color: "var(--primary)", icon: <Boxes className="h-5 w-5" /> },
    { id: "receiver", name: "Webhook receiver", color: "var(--primary)", icon: <Webhook className="h-5 w-5" /> },
];

export interface HubFlowProps {
    gap?: number;
    pillGap?: number;
    pillRadius?: number;
    topCurve?: number;
    bottomCurve?: number;
    particleColor?: string;
    bottomParticleColor?: string;
    particleSpeed?: number;
    particleLength?: number;
    particleWeight?: number;
    particleCurve?: number;
    curveTopGap?: number;
    curveBottomGap?: number;
}

export default function HubFlow({
    gap = 0,
    pillGap = 130,
    pillRadius = 999,
    topCurve = 120,
    bottomCurve = 120,
    particleColor = "#f97316",
    bottomParticleColor = "#3b82f6", 
    particleSpeed = 2.5,
    particleLength = 16,
    particleWeight = 3,
    particleCurve = 1.5,
    curveTopGap = 0,
    curveBottomGap = 0,
}: HubFlowProps) {

    // SVG Canvas configuration
    const CANVAS_WIDTH = 1000;
    const CANVAS_HEIGHT = 500;

    const TOP_Y = 70;
    const MID_Y = 250;
    const BOTTOM_Y = 420;
    const CENTER_X = CANVAS_WIDTH / 2;

    // Horizontal Spacing calculation
    const topNodesStartX = CENTER_X - (pillGap * (topInputNodes.length - 1)) / 2;
    const bottomNodeSpacing = pillGap * 0.65;
    const bottomNodesStartX = CENTER_X - (bottomNodeSpacing * (bottomOutputIcons.length - 1)) / 2;

    // Central Pill Dimensions
    const PILL_WIDTH = 170;
    const PILL_HEIGHT = 50;

    // Calculate exact target points based on the props
    const topStartY = TOP_Y + 36 + curveTopGap;
    const topTargetY = MID_Y - (PILL_HEIGHT / 2) - gap;

    const bottomStartY = MID_Y + (PILL_HEIGHT / 2) + gap;
    const bottomEndY = BOTTOM_Y - 24 - curveBottomGap;

    // Flawless cubic bezier generators
    const generateTopPath = (startX: number) => {
        return `M ${startX} ${topStartY} C ${startX} ${topStartY + topCurve}, ${CENTER_X} ${topTargetY - topCurve}, ${CENTER_X} ${topTargetY}`;
    };

    const generateBottomPath = (endX: number) => {
        return `M ${CENTER_X} ${bottomStartY} C ${CENTER_X} ${bottomStartY + bottomCurve}, ${endX} ${bottomEndY - bottomCurve}, ${endX} ${bottomEndY}`;
    };

    return (
        <div className="w-full bg-background text-foreground flex items-center justify-center p-0 font-sans overflow-hidden transition-colors duration-300">

            <div className="w-full overflow-x-auto custom-scrollbar flex justify-start md:justify-center">

                <div className="w-[1000px] h-[500px] relative shrink-0">

                    {/* Ambient Glow */}
                    <div
                        className="absolute inset-0 pointer-events-none rounded-2xl hidden dark:block transition-opacity duration-300"
                        style={{ background: `radial-gradient(circle at center, ${particleColor}15 0%, transparent 60%)` }}
                    />

                    {/* SVG Paths & Particles Canvas */}
                    <svg
                        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    >
                        <defs>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2.5" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Top Paths & Particles */}
                        {topInputNodes.map((node, index) => {
                            const nodeX = topNodesStartX + index * pillGap;
                            const pathData = generateTopPath(nodeX);
                            const delay = index * 0.4;

                            return (
                                <g key={`top-path-${node.id}`}>
                                    <path d={pathData} strokeWidth="1.5" className="stroke-border transition-colors duration-300" />

                                    <g filter="url(#glow)">
                                        <rect width={particleLength} height={particleWeight} rx={particleCurve} fill={particleColor} x={-(particleLength / 2)} y={-(particleWeight / 2)}>
                                            <animateMotion dur={`${particleSpeed}s`} repeatCount="indefinite" path={pathData} rotate="auto" begin={`${delay}s`} />
                                        </rect>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Bottom Paths & Particles - Perfectly Synchronized */}
                        {bottomOutputIcons.map((node, index) => {
                            const nodeX = bottomNodesStartX + index * bottomNodeSpacing;
                            const pathData = generateBottomPath(nodeX);

                            // The exact moment a top particle hits the center, a bottom particle emerges!
                            const delay = (index * 0.4) + particleSpeed;

                            return (
                                <g key={`bottom-path-${node.id}`}>
                                    <path d={pathData} strokeWidth="1.5" className="stroke-border transition-colors duration-300" />

                                    <g filter="url(#glow)">
                                        <rect width={particleLength - 2} height={particleWeight} rx={particleCurve} fill={bottomParticleColor} x={-((particleLength - 2) / 2)} y={-(particleWeight / 2)}>
                                            <animateMotion dur={`${particleSpeed * 0.8}s`} repeatCount="indefinite" path={pathData} rotate="auto" begin={`${delay}s`} />
                                        </rect>
                                    </g>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Top Input Nodes */}
                    {topInputNodes.map((node, index) => {
                        const nodeX = topNodesStartX + index * pillGap;
                        return (
                            <div
                                key={node.id}
                                className="absolute z-20 w-[72px] h-[72px] rounded-2xl border bg-card border-border flex flex-col items-center justify-center p-2 shadow-sm dark:shadow-lg transition-colors duration-300"
                                style={{ left: `${nodeX - 36}px`, top: `${TOP_Y - 36}px` }}
                            >
                                <div style={{ color: node.color }} className="transition-colors duration-300">
                                    {node.icon}
                                </div>
                                <span className="mt-1 max-w-full truncate text-[9px] font-medium text-muted-foreground">{node.name}</span>
                                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5 dark:ring-white/5 transition-colors duration-300" />
                            </div>
                        );
                    })}

                    {/* Central Brand Node & Pulse */}
                    <motion.div
                        className="absolute z-10 rounded-full blur-2xl opacity-10 dark:opacity-20 transition-opacity duration-300"
                        style={{ width: '120px', height: '120px', left: `${CENTER_X - 60}px`, top: `${MID_Y - 60}px`, backgroundColor: particleColor }}
                        animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.25, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />

                    <div
                        className="absolute z-30 flex items-center justify-center rounded-full border border-border bg-card px-4 shadow-lg transition-colors duration-300"
                        style={{
                            left: `${CENTER_X - (PILL_WIDTH / 2)}px`,
                            top: `${MID_Y - (PILL_HEIGHT / 2)}px`,
                            width: `${PILL_WIDTH}px`,
                            height: `${PILL_HEIGHT}px`,
                            borderRadius: `${pillRadius}px`
                        }}
                    >
                        <span className="font-bold text-[15px] tracking-tight text-foreground">Realdeal API</span>
                    </div>

                    {/* Bottom Output Nodes */}
                    {bottomOutputIcons.map((node, index) => {
                        const nodeX = bottomNodesStartX + index * bottomNodeSpacing;
                        return (
                            <React.Fragment key={node.id}>
                            <div
                                className="absolute z-20 w-12 h-12 rounded-full border bg-card border-border flex items-center justify-center shadow-sm dark:shadow-lg transition-colors duration-300"
                                style={{ left: `${nodeX - 24}px`, top: `${BOTTOM_Y - 24}px` }}
                            >
                                <div style={{ color: node.color }} className="transition-colors duration-300">
                                    {node.icon}
                                </div>
                            </div>
                            <span className="absolute z-20 w-24 -translate-x-1/2 text-center text-[10px] font-medium text-muted-foreground" style={{ left: `${nodeX}px`, top: `${BOTTOM_Y + 28}px` }}>{node.name}</span>
                        </React.Fragment>
                        );
                    })}

                </div>
            </div>
        </div>
    );
}