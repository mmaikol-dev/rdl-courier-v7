"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

// Capture the event at module scope, BEFORE React mounts. Chrome can fire
// `beforeinstallprompt` before the app has finished booting, and a listener
// registered inside useEffect would miss it entirely.
let deferredPrompt: BeforeInstallPromptEvent | null = null
let onPromptChanged: (() => void) | null = null

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault()
        deferredPrompt = e as BeforeInstallPromptEvent
        onPromptChanged?.()
    })
}

export function PwaInstallPrompt() {
    const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

    useEffect(() => {
        const sync = () => setPrompt(deferredPrompt)
        onPromptChanged = sync
        sync()

        const onInstalled = () => {
            deferredPrompt = null
            setPrompt(null)
        }
        window.addEventListener("appinstalled", onInstalled)

        return () => {
            onPromptChanged = null
            window.removeEventListener("appinstalled", onInstalled)
        }
    }, [])

    if (!prompt) return null

    const hide = () => {
        deferredPrompt = null
        setPrompt(null)
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-lg">
            <div className="text-sm">
                <div className="font-medium">Install RealDeal App</div>
                <div className="text-muted-foreground">Add this app to your device.</div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={hide}>
                    Not now
                </Button>
                <Button
                    onClick={async () => {
                        await prompt.prompt()
                        await prompt.userChoice
                        hide()
                    }}
                >
                    Install
                </Button>
            </div>
        </div>
    )
}
