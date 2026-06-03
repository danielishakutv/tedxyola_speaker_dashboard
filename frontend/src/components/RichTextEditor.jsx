import { useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3,
  List, ListOrdered, Quote, Link2, Eraser,
} from 'lucide-react';
import './RichTextEditor.css';

/* A small, dependency-free rich-text editor built on contentEditable.
   Emits the body's HTML string via onChange. Authors are trusted admins,
   so the HTML is stored as-is; render it on the public site with care. */

const RichTextEditor = ({ value = '', onChange, placeholder = 'Write here…', error = false }) => {
  const ref = useRef(null);

  /* Sync external value in (initial load / edit) without clobbering the
     caret while typing — only write when the DOM differs from the prop. */
  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => {
    let html = ref.current.innerHTML;
    if (html === '<br>' || html === '<div><br></div>') html = '';
    onChange(html);
  };

  const exec = (command, arg = null) => {
    ref.current.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const addLink = () => {
    const url = window.prompt('Link URL:', 'https://');
    if (url) exec('createLink', url);
  };

  const tools = [
    { icon: Bold,        title: 'Bold',           action: () => exec('bold') },
    { icon: Italic,      title: 'Italic',         action: () => exec('italic') },
    { icon: Underline,   title: 'Underline',      action: () => exec('underline') },
    { sep: true },
    { icon: Heading2,    title: 'Heading',        action: () => exec('formatBlock', 'H2') },
    { icon: Heading3,    title: 'Subheading',     action: () => exec('formatBlock', 'H3') },
    { icon: Quote,       title: 'Quote',          action: () => exec('formatBlock', 'BLOCKQUOTE') },
    { sep: true },
    { icon: List,        title: 'Bullet list',    action: () => exec('insertUnorderedList') },
    { icon: ListOrdered, title: 'Numbered list',  action: () => exec('insertOrderedList') },
    { icon: Link2,       title: 'Insert link',    action: addLink },
    { sep: true },
    { icon: Eraser,      title: 'Clear formatting', action: () => exec('removeFormat') },
  ];

  return (
    <div className={`rte ${error ? 'rte-error' : ''}`}>
      <div className="rte-toolbar">
        {tools.map((t, i) =>
          t.sep ? (
            <span key={i} className="rte-sep" />
          ) : (
            <button
              key={i}
              type="button"
              className="rte-tool"
              title={t.title}
              onMouseDown={(e) => { e.preventDefault(); t.action(); }}
            >
              <t.icon size={15} />
            </button>
          )
        )}
      </div>
      <div
        ref={ref}
        className="rte-content"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        suppressContentEditableWarning
      />
    </div>
  );
};

export default RichTextEditor;
