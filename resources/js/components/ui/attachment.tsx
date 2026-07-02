import * as React from "react"
import { cn } from "@/lib/utils"

const AttachmentGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-group"
    className={cn("flex flex-col gap-3", className)}
    {...props}
  />
))
AttachmentGroup.displayName = "AttachmentGroup"

const Attachment = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    orientation?: "horizontal" | "vertical"
    state?: "idle" | "uploading" | "error"
  }
>(({ className, orientation = "horizontal", state = "idle", ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment"
    data-orientation={orientation}
    data-state={state}
    className={cn(
      "bg-card text-card-foreground relative flex rounded-xl border p-3 shadow-xs transition-all",
      orientation === "horizontal" ? "flex-row items-center gap-3" : "flex-col gap-2",
      state === "uploading" && "border-dashed opacity-60",
      state === "error" && "border-destructive",
      className
    )}
    {...props}
  />
))
Attachment.displayName = "Attachment"

const AttachmentMedia = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { variant?: "icon" | "image" | "avatar" }
>(({ className, variant = "icon", ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-media"
    data-variant={variant}
    className={cn(
      "shrink-0 overflow-hidden",
      variant === "image" && "rounded-lg",
      variant === "avatar" && "rounded-full",
      variant === "icon" && "text-muted-foreground flex items-center justify-center",
      className
    )}
    {...props}
  />
))
AttachmentMedia.displayName = "AttachmentMedia"

const AttachmentContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-content"
    className={cn("flex-1 min-w-0 space-y-0.5", className)}
    {...props}
  />
))
AttachmentContent.displayName = "AttachmentContent"

const AttachmentTitle = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<"p">
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="attachment-title"
    className={cn("text-sm font-medium leading-none truncate", className)}
    {...props}
  />
))
AttachmentTitle.displayName = "AttachmentTitle"

const AttachmentDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<"p">
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="attachment-description"
    className={cn("text-xs text-muted-foreground truncate", className)}
    {...props}
  />
))
AttachmentDescription.displayName = "AttachmentDescription"

const AttachmentActions = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-actions"
    className={cn("flex items-center gap-1 shrink-0", className)}
    {...props}
  />
))
AttachmentActions.displayName = "AttachmentActions"

const AttachmentAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    data-slot="attachment-action"
    className={cn(
      "text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-1 transition-colors",
      className
    )}
    {...props}
  />
))
AttachmentAction.displayName = "AttachmentAction"

export {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
}
