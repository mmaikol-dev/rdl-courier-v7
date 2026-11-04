"use client";

// Adapted from the ReactVibe motion component (MIT): https://github.com/siddhantmani/reactvibe
import { Boxes, KeyRound, Package, Webhook } from "lucide-react";

// Helper component for the corner bracket styling seen in the image
const NodeBrackets = () => (
    <>
        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-border transition-colors duration-300" />
        <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-border transition-colors duration-300" />
        <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-border transition-colors duration-300" />
        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-border transition-colors duration-300" />
    </>
);

const bottomIntegrationNodes = [
    { id: "orders", color: "var(--primary)", icon: <Package className="h-6 w-6" /> },
    { id: "products", color: "var(--primary)", icon: <Boxes className="h-6 w-6" /> },
    { id: "transfers", color: "var(--primary)", icon: <KeyRound className="h-6 w-6" /> },
    { id: "webhooks", color: "var(--primary)", icon: <Webhook className="h-6 w-6" /> },
];

export interface BranchFlowProps {
    curve?: number;
    topGap?: number;
    bottomGap?: number;
    curveColor?: string;
    particleSpeed?: number;
    particleColor?: string;
    particleLength?: number;
    particleRadius?: number;
    particleWeight?: number;
}

export default function BranchFlow({
    curve = 100,
    topGap = 0,
    bottomGap = 0,
    curveColor = "", // Defaults to adaptive styling if undefined/empty
    particleSpeed = 2.5,
    particleColor = "#f97316",
    particleLength = 12,
    particleRadius = 1.25,
    particleWeight = 2.5,
}: BranchFlowProps) {
    // Canvas dimensions
    const CANVAS_WIDTH = 1000;
    const CANVAS_HEIGHT = 500;

    // Node layout coordinates
    const TOP_NODE_Y = 120;
    const BOTTOM_NODES_Y = 380;
    const CENTER_X = CANVAS_WIDTH / 2;

    // Distribution calculations
    const nodeSpacing = 110;
    const bottomNodesStartX = CENTER_X - (nodeSpacing * (bottomIntegrationNodes.length - 1)) / 2;

    // Dimensions of the top central block
    const TOP_BLOCK_WIDTH = 110;
    const TOP_BLOCK_HEIGHT = 110;

    // Exact path connection points adjusted by gaps
    const pathStartY = TOP_NODE_Y + (TOP_BLOCK_HEIGHT / 2) + topGap;
    const pathEndY = BOTTOM_NODES_Y - 26 - bottomGap; // 26px is exactly half the 52px bottom node height

    // Cubic bezier generator
    const generatePath = (endX: number) => {
        return `M ${CENTER_X} ${pathStartY} C ${CENTER_X} ${pathStartY + curve}, ${endX} ${pathEndY - curve}, ${endX} ${pathEndY}`;
    };

    return (
        <div className="bg-background text-foreground flex items-center justify-center p-0 font-sans overflow-hidden transition-colors duration-300">

            <div className="w-full overflow-x-auto custom-scrollbar flex justify-start md:justify-center">

                <div className="w-[1000px] h-[500px] relative shrink-0">

                    {/*SVG Paths & Particles Canvas */}
                    <svg
                        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    >
                        <defs>
                            <filter id="glow-particle" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Iterate over paths and animate particles outwards */}
                        {bottomIntegrationNodes.map((node, index) => {
                            const nodeX = bottomNodesStartX + index * nodeSpacing;
                            const pathData = generatePath(nodeX);

                            // Stagger the animations slightly so they don't all fire uniformly
                            const delay = index * 0.3;

                            return (
                                <g key={`path-${node.id}`}>
                                    {/* Static background path */}
                                    <path
                                        d={pathData}
                                        strokeWidth="1.2"
                                        className={curveColor ? "" : "stroke-border transition-colors duration-300"}
                                        style={curveColor ? { stroke: curveColor } : {}}
                                    />

                                    {/* Flowing Particle */}
                                    <g filter="url(#glow-particle)">
                                        <rect
                                            width={particleLength}
                                            height={particleWeight}
                                            rx={particleRadius}
                                            fill={particleColor}
                                            x={-(particleLength / 2)}
                                            y={-(particleWeight / 2)}
                                        >
                                            <animateMotion
                                                dur={`${particleSpeed}s`}
                                                repeatCount="indefinite"
                                                path={pathData}
                                                rotate="auto"
                                                begin={`${delay}s`}
                                            />
                                        </rect>
                                    </g>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Top Central Brand Node */}
                    <div
                        className="absolute z-20 flex items-center justify-center bg-card transition-colors duration-300"
                        style={{
                            width: `${TOP_BLOCK_WIDTH}px`,
                            height: `${TOP_BLOCK_HEIGHT}px`,
                            left: `${CENTER_X - (TOP_BLOCK_WIDTH / 2)}px`,
                            top: `${TOP_NODE_Y - (TOP_BLOCK_HEIGHT / 2)}px`,
                        }}
                    >
                        <NodeBrackets />

                        {/* API integration node */}
                        <div className="text-center text-xs font-semibold text-foreground">RDL<br />API</div>
                    </div>

                    {/* Bottom Output Nodes */}
                    {bottomIntegrationNodes.map((node, index) => {
                        const nodeX = bottomNodesStartX + index * nodeSpacing;
                        return (
                            <div
                                key={node.id}
                                className="absolute z-20 w-[52px] h-[52px] flex items-center justify-center p-2.5 bg-card transition-colors duration-300"
                                style={{
                                    left: `${nodeX - 26}px`,
                                    top: `${BOTTOM_NODES_Y - 26}px`
                                }}
                            >
                                <NodeBrackets />

                                <div style={{ color: node.color }} className="transition-colors duration-300">
                                    {node.icon}
                                </div>
                            </div>
                        );
                    })}
                    {bottomIntegrationNodes.map((node, index) => {
                        const nodeX = bottomNodesStartX + index * nodeSpacing;
                        const labels: Record<string, string> = { orders: 'Orders', products: 'Products', transfers: 'Transfers', webhooks: 'Webhooks' };
                        return <div key={`${node.id}-label`} className="absolute z-20 w-24 -translate-x-1/2 text-center text-xs font-medium text-muted-foreground" style={{ left: `${nodeX}px`, top: `${BOTTOM_NODES_Y + 36}px` }}>{labels[node.id]}</div>;
                    })}

                </div>
            </div>
        </div>
    );
}