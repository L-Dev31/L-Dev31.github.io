import json
import os

def extract_year(date_str):
    """
    Extrait l'année à partir d'une chaîne de caractères pouvant être :
      - une date complète (ex: "01/01/1915")
      - une date incomplète (ex: "08/??/2015" ou "??/??/2015")
      - ou simplement une année (ex: "1815")
    Si l'année n'est pas trouvée, retourne None.
    """
    if not date_str:
        return None
    try:
        if "/" in date_str:
            parts = date_str.split("/")
            year_part = parts[-1]
        else:
            year_part = date_str
        # Conserver uniquement les chiffres pour ignorer les "??"
        year_part = ''.join(ch for ch in year_part if ch.isdigit())
        if year_part == "":
            return None
        return int(year_part)
    except Exception:
        return None

def main():
    # Chargement du fichier data.json
    with open("data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Dictionnaire pour regrouper les personnes par siècle (ou "unknown")
    buckets = {}

    for person in data:
        born = person.get("born")
        year = extract_year(born)
        if year is None:
            bucket = "unknown"
        else:
            # Calcul du siècle en prenant la centaine inférieure
            century = (year // 100) * 100
            bucket = str(century)
        # Chaque personne est ajoutée intégralement dans le bucket correspondant
        buckets.setdefault(bucket, []).append(person)
    
    # Création du dossier familyDatas s'il n'existe pas
    os.makedirs("familyDatas", exist_ok=True)

    # Écriture dans des fichiers JSON
    for bucket, persons in buckets.items():
        filename = f"familyDatas/data_{bucket}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(persons, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    main()
