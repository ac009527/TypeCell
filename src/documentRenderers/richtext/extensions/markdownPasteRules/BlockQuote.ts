import { Plugin, PluginKey } from "prosemirror-state";
import { Slice, Fragment, NodeType } from "prosemirror-model";
import { Editor } from "@tiptap/core";

const markdownBlockQuote = (
  editor: Editor,
  regexp: RegExp,
  type: NodeType,
  getAttributes?:
    | Record<string, any>
    | ((match: RegExpExecArray) => Record<string, any>)
): Plugin => {
  const markdown = (fragment: Fragment): Fragment => {
    const convertedNodes: any[] = [];
    const EMPTY = "";
    let texts: string[] = [];
    fragment.forEach((child) => {
      const innerTextBlock = child.firstChild;
      if (innerTextBlock && innerTextBlock.isText && innerTextBlock.text)
        texts.push(innerTextBlock.text);
      else texts.push(EMPTY);
    });

    let accumulatedText: string[] = [];
    const mergeTextsIntoQuote = () => {
      const fragContent = editor.schema.node(
        "paragraph",
        {},
        editor.schema.text(accumulatedText.join(" "))
      );
      const convertedNode = editor.schema.node("blockquote", {}, [fragContent]);
      convertedNodes.push(convertedNode);
      accumulatedText = [];
    };

    fragment.forEach((child, offset, index) => {
      const rawTextContent = texts[index];
      let match = regexp.exec(rawTextContent);

      // starting with > text...
      if (match !== null) {
        const markdownSymbols = match[0];
        const textContent = rawTextContent.slice(markdownSymbols.length);
        accumulatedText.push(textContent);
      }

      // ## heaings and other types
      else {
        if (accumulatedText.length > 0) {
          mergeTextsIntoQuote();
        }
        convertedNodes.push(child);
      }
    });

    if (accumulatedText.length > 0) {
      mergeTextsIntoQuote();
    }

    return Fragment.fromArray(convertedNodes);
  };
  return new Plugin({
    key: new PluginKey(`markdownPasteRuleBlockQuote`),
    props: {
      transformPasted: (slice) => {
        return new Slice(
          markdown(slice.content),
          slice.openStart,
          slice.openEnd
        );
      },
    },
  });
};

export default markdownBlockQuote;
