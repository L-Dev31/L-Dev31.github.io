import json
import os

def load_and_sort_data(directory):
    all_people = []

    for filename in os.listdir(directory):
        if filename.endswith(".json") and filename.startswith("data_"):
            file_path = os.path.join(directory, filename)
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                all_people.extend(data)

    all_people.sort(key=lambda person: extract_year(person.get("born")) or float('inf'))
    
    return all_people

def extract_year(date_str):
    if not date_str:
        return None
    try:
        if "/" in date_str:
            parts = date_str.split("/")
            year_part = parts[-1]
        else:
            year_part = date_str
        
        year_part = year_part.replace("?", "0")
        year_part = ''.join(ch for ch in year_part if ch.isdigit())
        
        if year_part == "":
            return None
        return int(year_part)
    except Exception:
        return None

def main():
    all_people = load_and_sort_data("familyDatas")
    
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(all_people, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    main()
