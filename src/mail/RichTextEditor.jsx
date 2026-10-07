import { useEffect, useId, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Icon } from "../admin/components";
import { safeLink } from "./model";

const extensions = [
  StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
    },
  }),
  Highlight,
];

export default function RichTextEditor({ value, onChange, disabled = false }) {
  const id = useId();
  const [linkOpen, setLinkOpen] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const editor = useEditor({
    // Mount after React commits the lazy component, so a Suspense render cannot
    // leave us holding an editor that was destroyed before it reached the DOM.
    immediatelyRender: false,
    extensions,
    content: value,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Mensagem",
        "aria-multiline": "true",
        "data-placeholder": "Escreva sua mensagem…",
      },
    },
    onUpdate: ({ editor: current }) =>
      onChange(current.getHTML(), current.getText()),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      !current || current.isDestroyed
        ? {}
        : {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            underline: current.isActive("underline"),
            highlight: current.isActive("highlight"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            link: current.isActive("link"),
          },
  });
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== editor.getHTML())
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!disabled);
  }, [editor, disabled]);
  const controls = [
    ["bold", "Negrito", "bold", "toggleBold"],
    ["italic", "Itálico", "italic", "toggleItalic"],
    ["underline", "Sublinhado", "underline", "toggleUnderline"],
    ["highlight", "Grifar texto", "highlight", "toggleHighlight"],
    ["bulletList", "Lista com marcadores", "list", "toggleBulletList"],
    ["orderedList", "Lista numerada", "listOrdered", "toggleOrderedList"],
  ];
  const applyLink = () => {
    const href = safeLink(url);
    if (!href) {
      setError("Informe um link válido, como https://duukfilms.com.");
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive("link"))
      chain
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    else chain.extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
    setError("");
  };
  return (
    <div className={`mail-editor${disabled ? " is-disabled" : ""}`}>
      <div
        className="mail-editor__toolbar"
        role="group"
        aria-label="Formatação da mensagem"
      >
        {controls.map(([key, label, icon, command]) => (
          <button
            key={key}
            type="button"
            className="admin-icon-button"
            aria-label={label}
            title={label}
            aria-pressed={!!active?.[key]}
            disabled={!editor || disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus()[command]().run()}
          >
            <Icon name={icon} />
          </button>
        ))}
        <span className="mail-editor__divider" aria-hidden="true" />
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Inserir link"
          title="Inserir link"
          aria-pressed={!!active?.link}
          disabled={!editor || disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setUrl(editor.getAttributes("link").href || "");
            setLinkOpen(!linkOpen);
            setError("");
          }}
        >
          <Icon name="link" />
        </button>
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Limpar formatação"
          title="Limpar formatação"
          disabled={!editor || disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        >
          <Icon name="clearFormat" />
        </button>
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Desfazer"
          title="Desfazer"
          disabled={!editor || disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="admin-icon-button"
          aria-label="Refazer"
          title="Refazer"
          disabled={!editor || disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Icon name="redo" />
        </button>
      </div>
      {linkOpen && (
        <div className="mail-editor__link">
          <label className="admin-field" htmlFor={id}>
            <span>Endereço do link</span>
            <input
              id={id}
              type="text"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={disabled}
            onClick={applyLink}
          >
            Aplicar
          </button>
          {active?.link && (
            <button
              type="button"
              className="admin-text-button"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remover link
            </button>
          )}
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
      <small className="mail-editor__hint">
        Selecione um trecho para formatar. Ctrl / ⌘ + B para negrito.
      </small>
    </div>
  );
}
