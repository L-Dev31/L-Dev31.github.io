import tkinter as tk
from tkinter import ttk
from tkinter import filedialog
import tkinterhtml as tkhtml
import webbrowser

def set_dark_style():
    style = ttk.Style()
    style.theme_use('clam')

    dark_background = '#2E2E2E'
    light_text = '#FFFFFF'
    button_color = '#4E4E4E'

    style.configure("TButton",
                    background=button_color,
                    foreground=light_text,
                    relief=tk.FLAT)

    style.configure("TLabel",
                    background=dark_background,
                    foreground=light_text)

    style.configure("TEntry",
                    fieldbackground=dark_background,
                    background=dark_background,
                    foreground=light_text)

    style.configure("TNotebook",
                    background=dark_background)

    style.map("TButton",
              background=[('active', button_color)])

def open_file():
    file_path = filedialog.askopenfilename(filetypes=[("HTML files", "*.html")])
    if file_path:
        with open(file_path, "r", encoding='utf-8') as file:
            content = file.read()
            text_content.delete("1.0", tk.END)
            text_content.insert(tk.END, content)
            update_preview()

def save_file():
    content = text_content.get("1.0", tk.END)
    file_path = filedialog.asksaveasfilename(defaultextension=".html", filetypes=[("HTML files", "*.html")])
    if file_path:
        with open(file_path, "w", encoding='utf-8') as file:
            file.write(content)

def save_file_as():
    content = text_content.get("1.0", tk.END)
    file_path = filedialog.asksaveasfilename(defaultextension=".html", filetypes=[("HTML files", "*.html")])
    if file_path:
        with open(file_path, "w", encoding='utf-8') as file:
            file.write(content)

def update_preview():
    content = text_content.get("1.0", tk.END)
    with open("temp.html", "w", encoding='utf-8') as temp_file:
        temp_file.write(content)

    webbrowser.open("file:///" + "temp.html", new=2)  # Open in default browser

def edit_tags():
    selected_text = text_content.get(tk.SEL_FIRST, tk.SEL_LAST)

    tag_editor = tk.Toplevel(root)
    tag_editor.title("Éditer les balises HTML")

    tag_editor_text = tk.Text(tag_editor, wrap="word", width=40, height=10)
    tag_editor_text.pack(padx=20, pady=20)
    tag_editor_text.insert(tk.END, selected_text)

    save_button = ttk.Button(tag_editor, text="Sauvegarder", command=lambda: save_tags(tag_editor, tag_editor_text, selected_text))
    save_button.pack(pady=10)

def save_tags(tag_editor, tag_editor_text, selected_text):
    edited_content = tag_editor_text.get("1.0", tk.END)

    text_content.delete(tk.SEL_FIRST, tk.SEL_LAST)
    text_content.insert(tk.SEL_FIRST, edited_content)

    tag_editor.destroy()
    update_preview()

def create_gui():
    global root
    root = tk.Tk()
    root.title("Atomos - Website Editor")

    set_dark_style()

    menu_bar = tk.Menu(root)
    root.config(menu=menu_bar)

    file_menu = tk.Menu(menu_bar, tearoff=0)
    menu_bar.add_cascade(label="Fichier", menu=file_menu)
    file_menu.add_command(label="Ouvrir", command=open_file)
    file_menu.add_command(label="Enregistrer", command=save_file)
    file_menu.add_command(label="Enregistrer sous...", command=save_file_as)
    file_menu.add_separator()
    file_menu.add_command(label="Quitter", command=root.destroy)

    edit_menu = tk.Menu(menu_bar, tearoff=0)
    menu_bar.add_cascade(label="Éditer", menu=edit_menu)
    edit_menu.add_command(label="Éditer les balises", command=edit_tags)

    main_frame = ttk.Frame(root)
    main_frame.pack(fill=tk.BOTH, expand=True)

    notebook = ttk.Notebook(main_frame)
    notebook.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    text_tab = ttk.Frame(notebook)
    notebook.add(text_tab, text="Textes + Liens")

    images_tab = ttk.Frame(notebook)
    notebook.add(images_tab, text="Images")

    colors_tab = ttk.Frame(notebook)
    notebook.add(colors_tab, text="Couleurs")

    preview_frame = ttk.Frame(main_frame)
    preview_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

    global text_content
    text_content = tk.Text(text_tab, wrap="word", width=40, height=20)
    text_content.pack(padx=20, pady=20)

    update_button = ttk.Button(text_tab, text="Mettre à jour l'aperçu", command=update_preview)
    update_button.pack(padx=20, pady=10)

    root.mainloop()

if __name__ == "__main__":
    create_gui()
