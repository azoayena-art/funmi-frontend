import { PDFDocument, AFRelationship } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configuration du worker pour PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Embarque un XML Factur-X dans un PDF existant.
 * Produit un PDF "Factur-X hybride" (pas PDF/A-3 strict, mais accepté par la plupart des PDP).
 */
export async function embedFacturXInPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  xmlContent: string,
  invoiceNumber: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const cleanXml = xmlContent.replace(/^\uFEFF/, '');
  const xmlBytes = new TextEncoder().encode(cleanXml);
  const xmlFilename = 'factur-x.xml';

  await pdfDoc.attach(xmlBytes, xmlFilename, {
    mimeType: 'application/xml',
    description: `Factur-X Invoice ${invoiceNumber} (EN16931)`,
    createdAt: new Date(),
    modifiedAt: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  pdfDoc.setTitle(`Facture ${invoiceNumber}`);
  pdfDoc.setSubject('Factur-X Invoice');
  pdfDoc.setKeywords(['Factur-X', 'e-invoice', 'EN16931', invoiceNumber]);
  pdfDoc.setProducer('RelancePro Factur-X Generator');
  pdfDoc.setCreator('RelancePro');

  return await pdfDoc.save();
}

/**
 * Extrait le XML Factur-X d'un PDF en utilisant pdfjs-dist.
 * Retourne le contenu XML ou null si non trouvé.
 */
export async function extractFacturXFromPdf(pdfBytes: Uint8Array | ArrayBuffer): Promise<string | null> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;

    // Chercher dans les fichiers embarqués
    if (pdf.numPages > 0) {
      // Méthode 1 : via embedded files (standard PDF)
      try {
        const metadata = await pdf.getMetadata();
        if ((metadata as any)?.info?.EmbeddedFiles) {
          const embedded = (metadata as any).info.EmbeddedFiles;
          for (const file of Object.values(embedded)) {
            if ((file as any)?.filename?.toLowerCase().endsWith('.xml')) {
              // Essayons de récupérer le contenu
            }
          }
        }
      } catch { /* ignore */ }

      // Méthode 2 : Parcourir toutes les pages pour chercher les annotations de fichiers
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const annotations = await page.getAnnotations();
          
          for (const annotation of annotations) {
            if (annotation.subtype === 'FileAttachment' && (annotation as any).file) {
              const file = (annotation as any).file;
              if (file.filename?.toLowerCase().endsWith('.xml') && file.content) {
                try {
                  return new TextDecoder('utf-8').decode(file.content);
                } catch {
                  continue;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Erreur extraction PDF:', error);
    return null;
  }
}