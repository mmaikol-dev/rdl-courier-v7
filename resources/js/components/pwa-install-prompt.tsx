"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            setVisible(true)
        }

        window.addEventListener("beforeinstallprompt", handler)

        window.addEventListener("appinstalled", () => {
            setVisible(false)
            setDeferredPrompt(null)
        })

        return () => window.removeEventListener("beforeinstallprompt", handler)
    }, [])

    if (!visible || !deferredPrompt) return null

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm">
                <div className="font-medium">Install RealDeal App</div>
                <div className="text-muted-foreground">Add this app to your device.</div>
            </div>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={() => {
                        setVisible(false)
                    }}
                >
                    Not now
                </Button>
                <Button
                    onClick={async () => {
                        await deferredPrompt.prompt()
                        const choice = await deferredPrompt.userChoice
                        if (choice.outcome !== "accepted") {
                            setVisible(false)
                        }
                        setDeferredPrompt(null)
                    }}
                >
                    Install
                </Button>
            </div>
        </div>
    )
}
