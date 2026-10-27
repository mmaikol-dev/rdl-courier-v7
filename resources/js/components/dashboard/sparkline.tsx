import { Line, LineChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
    data: number[];
    className?: string;
}

export function Sparkline({ data, className }: SparklineProps) {
    if (data.length < 2) return <div aria-hidden="true" className={className} />;

    return (
        <div aria-hidden="true" className={className}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.map((value, index) => ({ index, value }))}>
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        dot={(props) => {
                            const { cx, cy, index } = props;

                            return index === data.length - 1 ? (
                                <circle key={`sparkline-dot-${index}`} cx={cx} cy={cy} r={2.5} fill="currentColor" />
                            ) : null;
                        }}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
