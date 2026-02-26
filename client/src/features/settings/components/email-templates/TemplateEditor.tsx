/**
 * TemplateEditor — Tiptap WYSIWYG editor for email templates.
 *
 * A headless Tiptap editor with a custom toolbar for formatting,
 * link insertion, and template variable insertion via a dialog.
 */
import { forwardRef, useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
export type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Undo,
  Redo,
  Code,
  Variable,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Toggle } from "@/shared/components/ui/toggle";
import { Separator } from "@/shared/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import type { TemplateVariable } from "@shared/schemas/email-template.schema";

// ============================================================================
// TYPES
// ============================================================================

interface TemplateEditorProps {
  /** Current HTML content */
  content: string;
  /** Callback when content changes */
  onChange: (html: string) => void;
  /** Available template variables for this template type */
  variables: TemplateVariable[];
  /** Callback when a variable insertion dialog is requested */
  onInsertVariable?: () => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Ref to expose the Tiptap editor instance for external operations */
  editorRef?: React.MutableRefObject<Editor | null>;
}

// ============================================================================
// TOOLBAR BUTTON HELPER
// ============================================================================

interface ToolbarButtonProps {
  editor: Editor;
  action: () => void;
  isActive?: boolean;
  title: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

function ToolbarButton({ action, isActive, title, icon, disabled }: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={isActive}
            onPressedChange={() => action()}
            disabled={disabled}
            className="h-8 w-8 p-0"
            aria-label={title}
          >
            {icon}
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// LINK POPOVER
// ============================================================================

const LinkToggleButton = forwardRef<
  HTMLButtonElement,
  { editor: Editor; onToggle: () => void }
>(({ editor, onToggle, ...props }, ref) => (
  <Toggle
    ref={ref}
    size="sm"
    pressed={editor.isActive("link")}
    onPressedChange={onToggle}
    className="h-8 w-8 p-0"
    aria-label="Insert link"
    {...props}
  >
    <LinkIcon className="h-4 w-4" />
  </Toggle>
));
LinkToggleButton.displayName = "LinkToggleButton";

function LinkPopover({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const handleSetLink = useCallback(() => {
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setOpen(false);
    setUrl("");
  }, [editor, url]);

  const handleToggle = useCallback(() => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
    } else {
      const existingHref = editor.getAttributes("link").href;
      setUrl(existingHref ?? "");
      setOpen(true);
    }
  }, [editor]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <LinkToggleButton editor={editor} onToggle={handleToggle} />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Insert link
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSetLink();
              }
            }}
            className="text-sm"
          />
          <Button size="sm" onClick={handleSetLink}>
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// TOOLBAR
// ============================================================================

function EditorToolbar({
  editor,
  onInsertVariable,
  readOnly,
}: {
  editor: Editor;
  onInsertVariable?: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) return null;

  const iconSize = "h-4 w-4";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5 bg-muted/30">
      {/* Text formatting */}
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
        icon={<Bold className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
        icon={<Italic className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline"
        icon={<UnderlineIcon className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
        icon={<Strikethrough className={iconSize} />}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet list"
        icon={<List className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Ordered list"
        icon={<ListOrdered className={iconSize} />}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        title="Align left"
        icon={<AlignLeft className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        title="Align center"
        icon={<AlignCenter className={iconSize} />}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        title="Align right"
        icon={<AlignRight className={iconSize} />}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Link */}
      <LinkPopover editor={editor} />

      {/* Code */}
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline code"
        icon={<Code className={iconSize} />}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Variable insertion */}
      {onInsertVariable && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onInsertVariable}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Variable className={iconSize} />
                Variable
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert template variable
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo/Redo */}
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().undo().run()}
        isActive={false}
        title="Undo"
        icon={<Undo className={iconSize} />}
        disabled={!editor.can().undo()}
      />
      <ToolbarButton
        editor={editor}
        action={() => editor.chain().focus().redo().run()}
        isActive={false}
        title="Redo"
        icon={<Redo className={iconSize} />}
        disabled={!editor.can().redo()}
      />
    </div>
  );
}

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================

export function TemplateEditor({
  content,
  onChange,
  variables,
  onInsertVariable,
  readOnly = false,
  placeholder = "Write your email template...",
  editorRef,
}: TemplateEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,  // Email templates don't need headings typically
        link: false,     // Use standalone Link with custom config below
        underline: false, // Use standalone Underline below to avoid duplicates
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      TextAlign.configure({
        types: ["paragraph"],
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[200px] max-h-[400px] overflow-y-auto p-3 prose prose-sm dark:prose-invert max-w-none focus:outline-none " +
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
      },
    },
  });

  // Sync external content changes (e.g., reset to default)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Expose editor instance for external variable insertion
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  if (!editor) {
    return (
      <div className="border rounded-md min-h-[200px] animate-pulse bg-muted/20" />
    );
  }

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      <EditorToolbar
        editor={editor}
        onInsertVariable={onInsertVariable}
        readOnly={readOnly}
      />
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Insert a template variable at the current cursor position.
 * Call this from the parent component after user selects a variable.
 */
export function insertVariableIntoEditor(
  editor: Editor | null,
  variableName: string
): void {
  if (!editor) return;
  editor
    .chain()
    .focus()
    .insertContent(`{{${variableName}}}`)
    .run();
}
