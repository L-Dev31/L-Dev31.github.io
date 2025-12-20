# Correction : Erreur "The recipients address is empty"

L'erreur 422 "The recipients address is empty" que vous rencontrez signifie que l'adresse e-mail du destinataire n'est pas correctement configurée dans votre modèle EmailJS.

Voici comment corriger cela :

1.  **Allez à votre tableau de bord EmailJS.**
2.  Cliquez sur **"Email Templates"** dans le menu de gauche.
3.  Cliquez sur votre modèle, qui s'appelle `template_kcemrbw`.
4.  Allez dans l'onglet **"Settings"** en haut de l'éditeur de modèle.
5.  Dans le champ **"To Email"**, vous devez entrer `{{to_email}}`.

    Cela indiquera à EmailJS d'utiliser la variable `to_email` que nous envoyons depuis le code comme adresse e-mail du destinataire.

    **Assurez-vous que le champ ressemble à ceci :**

    ![Paramètre To Email dans EmailJS](https://i.imgur.com/Lz0s8Y6.png)
    *(Image d'exemple montrant le champ "To Email" avec `{{to_email}}` dedans)*

6.  Cliquez sur **"Save"** pour sauvegarder les modifications de votre modèle.

Une fois cette modification effectuée, le problème devrait être résolu. L'application enverra maintenant l'e-mail à l'adresse que vous avez saisie dans le champ "Email" du client.

## Pièce jointe PDF manquante

Si votre e-mail arrive mais sans la pièce jointe PDF, vérifiez les points suivants :

1. **Dans le modèle EmailJS (`template_kcemrbw`) :**
    - Ouvrez l'onglet **"Attachments"**.
    - Ajoutez une **Variable Attachment**.
    - **Parameter name** : mettez `pdf_attachment` (ou adaptez-le si votre code utilise un autre nom)
    - **Filename** : vous pouvez mettre `facture_{{invoice_number}}.pdf` ou `{{pdf_filename}}` si vous envoyez le nom depuis le code.
    - **Content type** : choisissez `PDF` ou `application/pdf`.
    - Enregistrez.

2. **Dans le code (`app.js`) :**
    - Le contenu de la pièce jointe doit être envoyé en Base64 ou en URL de données (data URL). Le code fournit dans le projet envoie une data URL complète (par ex. `data:application/pdf;base64,....`) via le paramètre `pdf_attachment` et envoie également `pdf_filename`.
    - Exemple (déjà appliqué dans `app.js`) :

```js
// lecture du blob en data URL (data:application/pdf;base64,...) et envoi
const pdf_dataurl = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(pdf_blob);
});

const templateParams = {
  to_email: to_email,
  invoice_number: invoice_number,
  pdf_attachment: pdf_dataurl,
  pdf_filename: `facture_${invoice_number}.pdf`,
};

await emailjs.send('SERVICE_ID', 'TEMPLATE_ID', templateParams);
```

3. **Taille du fichier :** EmailJS a une limite (plans gratuits ≈ 2-3MB). Si la pièce jointe est trop grosse, l'envoi peut échouer ou être ignoré — réduisez la taille du PDF (compresser images) ou passez à un plan supérieur.

4. **Test & Debug :**
    - Utilisez le bouton **"Test it"** dans l'éditeur de template pour vérifier que l'attachement s'ajoute correctement.
    - Consultez la console JavaScript lors de l'envoi pour les erreurs (413 = payload too large, etc.) et les logs dans le tableau de bord EmailJS.

Si vous voulez, je peux :
- vérifier que le paramètre `pdf_attachment` est bien le même que celui configuré dans votre template, ou
- forcer l'envoi d'un `data:` prefix (comme fait dans le code) si votre template demandait une data URL.

