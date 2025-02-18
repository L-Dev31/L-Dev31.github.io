import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import json
import os
import shutil

class RoundedFrame(tk.Canvas):
    def __init__(self, parent, radius=25, **kwargs):
        super().__init__(parent, **kwargs)
        self.radius = radius
        self.bind("<Configure>", self.draw_rounded)

    def draw_rounded(self, event=None):
        self.delete("all")
        width = self.winfo_width()
        height = self.winfo_height()
        self.create_rounded_rect(0, 0, width, height, self.radius, fill="#ffffff")

    def create_rounded_rect(self, x1, y1, x2, y2, r, **kwargs):
        points = (x1+r, y1, x1+r, y1, x2-r, y1, x2-r, y1,
                  x2, y1, x2, y1+r, x2, y1+r, x2, y2-r,
                  x2, y2-r, x2, y2, x2-r, y2, x2-r, y2,
                  x1+r, y2, x1+r, y2, x1, y2, x1, y2-r,
                  x1, y2-r, x1, y1+r, x1, y1+r, x1, y1)
        return self.create_polygon(points, **kwargs, smooth=True)

class FamilyTreeEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Family Tree Editor")
        self.root.geometry("1280x800")
        self.current_person = None
        self.images = {}
        
        # Set favicon
        self.set_favicon("../Images/logo/favicon.png")
        
        self.setup_styles()
        self.load_data()
        self.setup_ui()
        self.populate_person_list()

    def set_favicon(self, path):
        try:
            img = Image.open(path)
            img = ImageTk.PhotoImage(img)
            self.root.tk.call("wm", "iconphoto", self.root._w, img)
        except Exception as e:
            print(f"Error loading favicon: {e}")

    def setup_styles(self):
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        self.style.configure('TFrame', background='#f5f5f5')
        self.style.configure('TLabel', background='#f5f5f5', foreground='#333333', font=('Segoe UI', 10))
        self.style.configure('TButton', font=('Segoe UI', 10), padding=6, 
                           background='#4a7a8c', foreground='white', borderwidth=0)
        self.style.map('TButton', 
                      background=[('active', '#3a6a7c'), ('pressed', '#2a5a6c')])
        self.style.configure('TCombobox', fieldbackground='white', background='white')
        self.style.configure('TEntry', fieldbackground='white')

    def load_data(self):
        with open('data.json', 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        with open('country.json', 'r', encoding='utf-8') as f:
            self.countries = json.load(f)
        with open('religion.json', 'r', encoding='utf-8') as f:
            self.religions = json.load(f)
        with open('family.json', 'r', encoding='utf-8') as f:
            self.families = json.load(f)

    def setup_ui(self):
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)

        # Left Panel
        left_panel = RoundedFrame(main_frame, radius=15, bg='#f5f5f5', highlightthickness=0)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=5, pady=5)
        
        ttk.Label(left_panel, text="Family Members", font=('Segoe UI', 12, 'bold')).pack(pady=10)
        
        # Search Field
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(left_panel, textvariable=self.search_var, font=('Segoe UI', 10))
        self.search_entry.pack(fill=tk.X, padx=10, pady=5)
        self.search_entry.bind('<KeyRelease>', self.filter_person_list)
        
        self.person_list = tk.Listbox(left_panel, font=('Segoe UI', 10), 
                                    bg='white', relief='flat', highlightthickness=0)
        self.person_list.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.person_list.bind('<<ListboxSelect>>', self.on_person_select)

        # Right Panel
        right_panel = ttk.Frame(main_frame)
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        # Personal Info Section
        info_frame = RoundedFrame(right_panel, radius=15, bg='#f5f5f5', highlightthickness=0)
        info_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        
        self.img_label = ttk.Label(info_frame)
        self.img_label.place(x=20, y=20)

        entries = [
            ("ID:", 0), ("Name:", 1), ("Born:", 2), ("Died:", 3),
            ("Gender:", 4), ("Mother:", 6), ("Father:", 7)
        ]
        
        for text, row in entries:
            ttk.Label(info_frame, text=text).place(x=200, y=20 + row*40)

        self.id_entry = ttk.Entry(info_frame, width=25, font=('Segoe UI', 10))
        self.id_entry.place(x=300, y=20)
        self.name_entry = ttk.Entry(info_frame, width=30, font=('Segoe UI', 10))
        self.name_entry.place(x=300, y=60)
        self.born_entry = ttk.Entry(info_frame, width=15, font=('Segoe UI', 10))
        self.born_entry.place(x=300, y=100)
        self.death_entry = ttk.Entry(info_frame, width=15, font=('Segoe UI', 10))
        self.death_entry.place(x=300, y=140)
        
        self.gender_combo = ttk.Combobox(info_frame, values=["male", "female"], 
                                       width=8, font=('Segoe UI', 10))
        self.gender_combo.place(x=300, y=180)
        
        self.mother_combo = ttk.Combobox(info_frame, width=30, font=('Segoe UI', 10))
        self.mother_combo.place(x=300, y=260)
        self.mother_combo.bind('<KeyRelease>', lambda e: self.filter_parents('mother'))
        self.mother_combo.bind('<<ComboboxSelected>>', lambda e: self.update_parent('mother'))
        
        self.father_combo = ttk.Combobox(info_frame, width=30, font=('Segoe UI', 10))
        self.father_combo.place(x=300, y=300)
        self.father_combo.bind('<KeyRelease>', lambda e: self.filter_parents('father'))
        self.father_combo.bind('<<ComboboxSelected>>', lambda e: self.update_parent('father'))

        ttk.Button(info_frame, text="Upload Image", command=self.upload_image).place(x=300, y=340)

        # Location Section
        loc_frame = RoundedFrame(right_panel, radius=15, bg='#f5f5f5', highlightthickness=0)
        loc_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(loc_frame, text="Country:").grid(row=0, column=0, padx=20, pady=10)
        self.country_combo = ttk.Combobox(loc_frame, font=('Segoe UI', 10), width=30)
        self.country_combo.grid(row=0, column=1, pady=10)
        self.country_combo['values'] = [v['name'] for v in self.countries.values()]
        self.country_flag = ttk.Label(loc_frame)
        self.country_flag.grid(row=0, column=2, padx=10)
        
        ttk.Label(loc_frame, text="City:").grid(row=1, column=0, padx=20, pady=10)
        self.city_entry = ttk.Entry(loc_frame, font=('Segoe UI', 10), width=25)
        self.city_entry.grid(row=1, column=1, pady=10)

        # Religion Section
        rel_frame = RoundedFrame(right_panel, radius=15, bg='#f5f5f5', highlightthickness=0)
        rel_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(rel_frame, text="Religion:").grid(row=0, column=0, padx=20, pady=10)
        self.religion_combo = ttk.Combobox(rel_frame, font=('Segoe UI', 10), width=30)
        self.religion_combo.grid(row=0, column=1, pady=10)
        self.religion_combo['values'] = [v['name'] for v in self.religions.values()]
        self.religion_icon = ttk.Label(rel_frame)
        self.religion_icon.grid(row=0, column=2, padx=10)

        # Family Blason Section
        family_frame = RoundedFrame(right_panel, radius=15, bg='#f5f5f5', highlightthickness=0)
        family_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(family_frame, text="Family Blason:").grid(row=0, column=0, padx=20, pady=10)
        self.family_combo = ttk.Combobox(family_frame, font=('Segoe UI', 10), width=30)
        self.family_combo.grid(row=0, column=1, pady=10)
        self.family_combo['values'] = [v['name'] for v in self.families.values()]
        self.family_blason = ttk.Label(family_frame)
        self.family_blason.grid(row=0, column=2, padx=10)

        # Buttons
        btn_frame = ttk.Frame(right_panel)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="Save", command=self.save_person).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="New Person", command=self.new_person).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Delete", command=self.delete_person).pack(side=tk.LEFT, padx=5)

        # Bindings
        self.country_combo.bind('<<ComboboxSelected>>', self.update_country_flag)
        self.religion_combo.bind('<<ComboboxSelected>>', self.update_religion_icon)
        self.family_combo.bind('<<ComboboxSelected>>', self.update_family_blason)

    def filter_person_list(self, event=None):
        search_term = self.search_var.get().lower()
        self.person_list.delete(0, tk.END)
        for person in self.data:
            if search_term in person['name'].lower():
                self.person_list.insert(tk.END, person['name'])

    def populate_person_list(self):
        self.person_list.delete(0, tk.END)
        for person in self.data:
            self.person_list.insert(tk.END, person['name'])

    def on_person_select(self, event):
        index = self.person_list.curselection()
        if not index: return
        
        self.current_person = self.data[index[0]]
        self.id_entry.delete(0, tk.END)
        self.id_entry.insert(0, self.current_person.get('id', ''))
        self.name_entry.delete(0, tk.END)
        self.name_entry.insert(0, self.current_person.get('name', ''))
        self.born_entry.delete(0, tk.END)
        self.born_entry.insert(0, self.current_person.get('born', ''))
        self.death_entry.delete(0, tk.END)
        self.death_entry.insert(0, self.current_person.get('death', ''))
        self.gender_combo.set(self.current_person.get('gender', ''))
        self.city_entry.delete(0, tk.END)
        self.city_entry.insert(0, self.current_person.get('city', ''))

        # Parents
        self.update_parent_combo('mother')
        self.update_parent_combo('father')

        # Country/Religion/Family
        country_code = self.current_person.get('country', '')
        country = self.countries.get(country_code, {'name': ''})
        self.country_combo.set(country['name'])
        self.update_country_flag()
        
        religion_code = self.current_person.get('religion', '?')
        religion = self.religions.get(religion_code, {'name': 'Inconnue'})
        self.religion_combo.set(religion['name'])
        self.update_religion_icon()

        family_id = self.current_person.get('family', '')
        family = self.families.get(family_id, {'name': ''})
        self.family_combo.set(family['name'])
        self.update_family_blason()

        # Image
        img_path = self.current_person.get('img', '../Images/Persons/Unknown.jpg')
        self.show_image(img_path)

    def update_parent_combo(self, parent_type):
        combo = self.mother_combo if parent_type == 'mother' else self.father_combo
        gender = 'female' if parent_type == 'mother' else 'male'
        options = [f"{p['name']} ({p['id']})" for p in self.data if p.get('gender') == gender]
        combo['values'] = options
        
        pid = self.current_person.get('mid' if parent_type == 'mother' else 'fid', '')
        person = next((p for p in self.data if p['id'] == pid), None)
        combo.set(f"{person['name']} ({pid})" if person else '')

    def filter_parents(self, parent_type):
        combo = self.mother_combo if parent_type == 'mother' else self.father_combo
        search = combo.get().lower()
        gender = 'female' if parent_type == 'mother' else 'male'
        
        filtered = [
            f"{p['name']} ({p['id']})" 
            for p in self.data 
            if p.get('gender') == gender and search in p['name'].lower()
        ]
        combo['values'] = filtered

    def update_parent(self, parent_type):
        combo = self.mother_combo if parent_type == 'mother' else self.father_combo
        selected = combo.get()
        if selected and '(' in selected:
            pid = selected.split('(')[-1].rstrip(')').strip()
            key = 'mid' if parent_type == 'mother' else 'fid'
            self.current_person[key] = pid

    def show_image(self, path):
        try:
            image = Image.open(path)
            image.thumbnail((150, 150))
            photo = ImageTk.PhotoImage(image)
            self.img_label.configure(image=photo)
            self.img_label.image = photo
        except Exception as e:
            print(f"Error loading image: {e}")

    def update_country_flag(self, event=None):
        country_name = self.country_combo.get()
        country_code = next((k for k, v in self.countries.items() if v['name'] == country_name), None)
        if country_code:
            flag_path = f"../Images/{country_code}.png"
            self.load_image(flag_path, self.country_flag)

    def update_religion_icon(self, event=None):
        religion_name = self.religion_combo.get()
        religion_code = next((k for k, v in self.religions.items() if v['name'] == religion_name), '?')
        if religion_code:
            icon_path = f"../Images/{religion_code}.png"
            self.load_image(icon_path, self.religion_icon)

    def update_family_blason(self, event=None):
        family_name = self.family_combo.get()
        family_id = next((k for k, v in self.families.items() if v['name'] == family_name), '')
        if family_id:
            blason_path = f"../Images/{family_id}.png"
            self.load_image(blason_path, self.family_blason)

    def load_image(self, path, label):
        try:
            image = Image.open(path)
            image.thumbnail((30, 30))
            photo = ImageTk.PhotoImage(image)
            label.configure(image=photo)
            label.image = photo
        except Exception as e:
            print(f"Error loading image: {e}")

    def upload_image(self):
        file_path = filedialog.askopenfilename()
        if file_path:
            target_dir = "../Images/Persons"
            os.makedirs(target_dir, exist_ok=True)
            filename = os.path.basename(file_path)
            dest_path = os.path.join(target_dir, filename)
            shutil.copy(file_path, dest_path)
            self.current_person['img'] = f"../Images/Persons/{filename}"
            self.show_image(dest_path)

    def save_person(self):
        if not self.current_person: return

        self.current_person.update({
            'id': self.id_entry.get(),
            'name': self.name_entry.get(),
            'born': self.born_entry.get() or None,
            'death': self.death_entry.get() or None,
            'gender': self.gender_combo.get(),
            'city': self.city_entry.get() or None,
            'country': next((k for k, v in self.countries.items() if v['name'] == self.country_combo.get()), ''),
            'religion': next((k for k, v in self.religions.items() if v['name'] == self.religion_combo.get()), '?'),
            'family': next((k for k, v in self.families.items() if v['name'] == self.family_combo.get()), '')
        })

        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        self.populate_person_list()
        messagebox.showinfo("Saved", "Person data saved successfully")

    def new_person(self):
        new_person = {
            "id": f"new_{len(self.data)+1}",
            "name": "New Person",
            "img": "../Images/Persons/Unknown.jpg",
            "gender": "male",
            "religion": "?",
            "country": "al1867"
        }
        self.data.append(new_person)
        self.populate_person_list()

    def delete_person(self):
        if not self.current_person: return
        self.data.remove(self.current_person)
        self.populate_person_list()
        messagebox.showinfo("Deleted", "Person removed successfully")

if __name__ == "__main__":
    root = tk.Tk()
    app = FamilyTreeEditor(root)
    root.mainloop()