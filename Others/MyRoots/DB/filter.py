import json
import os

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

def normalize_name(name):
    # Diviser le nom en mots
    words = name.split()

    # Mettre chaque mot en majuscule si nécessaire, y compris après un tiret
    normalized_words = []
    for word in words:
        # Si le mot contient un tiret, on met la première lettre après le tiret en majuscule
        normalized_word = '-'.join([part.capitalize() for part in word.split('-')])
        normalized_words.append(normalized_word)

    # Joindre les mots normalisés en un seul nom
    return " ".join(normalized_words)

def main():
    with open("data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    buckets = {}

    for person in data:
        if "name" in person and person["name"]:
            person["name"] = normalize_name(person["name"])
        
        born = person.get("born")
        year = extract_year(born)
        if year is None:
            bucket = "unknown"
        else:
            century = (year // 100) * 100
            bucket = str(century)
        
        buckets.setdefault(bucket, []).append(person)
    
    os.makedirs("familyDatas", exist_ok=True)

    for bucket, persons in buckets.items():
        persons.sort(key=lambda person: extract_year(person.get("born")) or float('inf'))
        filename = f"familyDatas/data_{bucket}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(persons, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    main()
