import { BubbleMenu, Editor } from "@tiptap/react";
import React from "react";
import styles from "./InlineMenu.module.css";

type InlineMenuProps = { editor: Editor };

class InlineMenu extends React.Component<InlineMenuProps> {
  render() {
    return (
      <BubbleMenu className={styles.BubbleMenu} editor={this.props.editor}>
        <button
          onClick={() => this.props.editor.chain().focus().toggleBold().run()}
          className={this.props.editor.isActive("bold") ? styles.isActive : ""}>
          Bold
        </button>
        <button
          onClick={() => this.props.editor.chain().focus().toggleItalic().run()}
          className={
            this.props.editor.isActive("italic") ? styles.isActive : ""
          }>
          Italic
        </button>
        <button
          onClick={() => this.props.editor.chain().focus().toggleStrike().run()}
          className={
            this.props.editor.isActive("strike") ? styles.isActive : ""
          }>
          Strike
        </button>
        <button
          onClick={() => this.props.editor.chain().focus().toggleCode().run()}
          className={this.props.editor.isActive("code") ? styles.isActive : ""}>
          Code
        </button>
        <button
          onClick={() =>
            this.props.editor.chain().focus().toggleUnderline().run()
          }
          className={
            this.props.editor.isActive("underline") ? styles.isActive : ""
          }>
          Underline
        </button>
      </BubbleMenu>
    );
  }
}

export default InlineMenu;
