import * as XLSX from 'xlsx';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID, Permission, Role } from 'appwrite';

// ============================================================
// 📋 TYPES
// ============================================================

export interface ProspectData {
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  source?: string;
  status?: string;
  needs?: string;
  notes?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
}

export interface ClientData {
  clientId?: string;
  type?: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  status?: string;
  notes?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
}

export interface ImportResult {
  total: number;
  success: number;
  duplicates: number;
  errors: number;
  errorDetails: Array<{ row: number; field: string; message: string }>;
  duplicateDetails: Array<{ row: number; name: string; existingId: string }>;
}

export interface ParsedRow {
  row: number;
  data: ProspectData | ClientData;
  errors: string[];
  isValid: boolean;
}

// ============================================================
// 📊 DÉFINITION DES COLONNES
// ============================================================

export const PROSPECT_COLUMNS = [
  { key: 'firstName', label: 'Prénom *', required: true },
  { key: 'lastName', label: 'Nom *', required: true },
  { key: 'companyName', label: 'Entreprise', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Téléphone', required: false },
  { key: 'address', label: 'Adresse', required: false },
  { key: 'postalCode', label: 'Code postal', required: false },
  { key: 'city', label: 'Ville', required: false },
  { key: 'country', label: 'Pays', required: false },
  { key: 'source', label: 'Source', required: false },
  { key: 'status', label: 'Statut', required: false },
  { key: 'needs', label: 'Besoins', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'siren', label: 'SIREN', required: false },
  { key: 'siret', label: 'SIRET', required: false },
  { key: 'vatNumber', label: 'N° TVA', required: false },
];

export const CLIENT_COLUMNS = [
  { key: 'clientId', label: 'N° Client', required: false },
  { key: 'type', label: 'Type (particulier/entreprise)', required: false },
  { key: 'firstName', label: 'Prénom *', required: true },
  { key: 'lastName', label: 'Nom *', required: true },
  { key: 'companyName', label: 'Entreprise', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Téléphone', required: false },
  { key: 'address', label: 'Adresse', required: false },
  { key: 'postalCode', label: 'Code postal', required: false },
  { key: 'city', label: 'Ville', required: false },
  { key: 'country', label: 'Pays', required: false },
  { key: 'status', label: 'Statut', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'siren', label: 'SIREN', required: false },
  { key: 'siret', label: 'SIRET', required: false },
  { key: 'vatNumber', label: 'N° TVA', required: false },
];

// ============================================================
// ✅ VALIDATIONS
// ============================================================

const validateEmail = (email: string): boolean => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePhone = (phone: string): boolean => {
  if (!phone) return true;
  return /^[\d\s\+\-\(\)\.]{6,20}$/.test(phone);
};

const validatePostalCode = (postalCode: string, country: string): boolean => {
  if (!postalCode) return true;
  if (country === 'FR' || !country) return /^\d{5}$/.test(postalCode);
  return postalCode.length >= 3 && postalCode.length <= 10;
};

// ============================================================
// 📤 EXPORT CSV
// ============================================================

export const exportProspectsToCSV = async (
  teamId: string,
  filename: string = 'prospects'
): Promise<{ success: boolean; count: number }> => {
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'prospects', [
      Query.equal('teamId', teamId),
      Query.orderDesc('$createdAt'),
      Query.limit(5000),
    ]);

    if (res.documents.length === 0) {
      return { success: false, count: 0 };
    }

    // En-têtes
    const headers = PROSPECT_COLUMNS.map(c => c.label);

    // Données
    const rows = res.documents.map((doc: any) => [
      doc.firstName || '',
      doc.lastName || '',
      doc.companyName || '',
      doc.email || '',
      doc.phone || '',
      doc.address || '',
      doc.postalCode || '',
      doc.city || '',
      doc.country || '',
      doc.source || '',
      doc.status || '',
      doc.needs || '',
      doc.notes || '',
      doc.siren || '',
      doc.siret || '',
      doc.vatNumber || '',
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { success: true, count: res.documents.length };
  } catch (error) {
    console.error('Erreur export CSV prospects:', error);
    return { success: false, count: 0 };
  }
};

export const exportClientsToCSV = async (
  teamId: string,
  filename: string = 'clients'
): Promise<{ success: boolean; count: number }> => {
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'clients', [
      Query.equal('teamId', teamId),
      Query.orderDesc('$createdAt'),
      Query.limit(5000),
    ]);

    if (res.documents.length === 0) {
      return { success: false, count: 0 };
    }

    const headers = CLIENT_COLUMNS.map(c => c.label);

    const rows = res.documents.map((doc: any) => [
      doc.clientId || '',
      doc.type || '',
      doc.firstName || '',
      doc.lastName || '',
      doc.companyName || '',
      doc.email || '',
      doc.phone || '',
      doc.address || '',
      doc.postalCode || '',
      doc.city || '',
      doc.country || '',
      doc.status || '',
      doc.notes || '',
      doc.siren || '',
      doc.siret || '',
      doc.vatNumber || '',
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { success: true, count: res.documents.length };
  } catch (error) {
    console.error('Erreur export CSV clients:', error);
    return { success: false, count: 0 };
  }
};

// ============================================================
// 📤 EXPORT EXCEL
// ============================================================

export const exportProspectsToExcel = async (
  teamId: string,
  filename: string = 'prospects'
): Promise<{ success: boolean; count: number }> => {
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'prospects', [
      Query.equal('teamId', teamId),
      Query.orderDesc('$createdAt'),
      Query.limit(5000),
    ]);

    if (res.documents.length === 0) {
      return { success: false, count: 0 };
    }

    const data = res.documents.map((doc: any) => ({
      'Prénom': doc.firstName || '',
      'Nom': doc.lastName || '',
      'Entreprise': doc.companyName || '',
      'Email': doc.email || '',
      'Téléphone': doc.phone || '',
      'Adresse': doc.address || '',
      'Code postal': doc.postalCode || '',
      'Ville': doc.city || '',
      'Pays': doc.country || '',
      'Source': doc.source || '',
      'Statut': doc.status || '',
      'Besoins': doc.needs || '',
      'Notes': doc.notes || '',
      'SIREN': doc.siren || '',
      'SIRET': doc.siret || '',
      'N° TVA': doc.vatNumber || '',
      'Créé le': doc.$createdAt ? new Date(doc.$createdAt).toLocaleDateString('fr-FR') : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Largeur des colonnes
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 },
      { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospects');

    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);

    return { success: true, count: res.documents.length };
  } catch (error) {
    console.error('Erreur export Excel prospects:', error);
    return { success: false, count: 0 };
  }
};

export const exportClientsToExcel = async (
  teamId: string,
  filename: string = 'clients'
): Promise<{ success: boolean; count: number }> => {
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'clients', [
      Query.equal('teamId', teamId),
      Query.orderDesc('$createdAt'),
      Query.limit(5000),
    ]);

    if (res.documents.length === 0) {
      return { success: false, count: 0 };
    }

    const data = res.documents.map((doc: any) => ({
      'N° Client': doc.clientId || '',
      'Type': doc.type || '',
      'Prénom': doc.firstName || '',
      'Nom': doc.lastName || '',
      'Entreprise': doc.companyName || '',
      'Email': doc.email || '',
      'Téléphone': doc.phone || '',
      'Adresse': doc.address || '',
      'Code postal': doc.postalCode || '',
      'Ville': doc.city || '',
      'Pays': doc.country || '',
      'Statut': doc.status || '',
      'Notes': doc.notes || '',
      'SIREN': doc.siren || '',
      'SIRET': doc.siret || '',
      'N° TVA': doc.vatNumber || '',
      'Créé le': doc.$createdAt ? new Date(doc.$createdAt).toLocaleDateString('fr-FR') : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 25 },
      { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 15 },
      { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');

    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);

    return { success: true, count: res.documents.length };
  } catch (error) {
    console.error('Erreur export Excel clients:', error);
    return { success: false, count: 0 };
  }
};

// ============================================================
// 📥 TÉLÉCHARGEMENT DE TEMPLATES
// ============================================================

export const downloadProspectTemplate = (format: 'csv' | 'excel') => {
  const headers = PROSPECT_COLUMNS.map(c => c.label);
  
  // Exemple de données
  const exampleData = [
    ['Jean', 'Dupont', 'Dupont SARL', 'jean.dupont@email.fr', '0612345678', 
     '12 rue de la Paix', '75001', 'Paris', 'FR', 'website', 'new',
     'Rénovation salle de bain', 'Contact via formulaire', '', '', ''],
    ['Marie', 'Martin', '', 'marie.martin@gmail.com', '0698765432',
     '45 avenue des Champs', '69001', 'Lyon', 'FR', 'phone', 'new',
     'Installation chaudière', '', '', '', ''],
  ];

  if (format === 'csv') {
    const csvContent = [headers.join(';'), ...exampleData.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_prospects.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    worksheet['!cols'] = headers.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospects');
    XLSX.writeFile(workbook, 'template_prospects.xlsx');
  }
};

export const downloadClientTemplate = (format: 'csv' | 'excel') => {
  const headers = CLIENT_COLUMNS.map(c => c.label);
  
  const exampleData = [
    ['CLI-2026-001', 'entreprise', 'Jean', 'Dupont', 'Dupont SARL', 
     'jean.dupont@email.fr', '0612345678', '12 rue de la Paix', '75001',
     'Paris', 'FR', 'active', 'Client fidèle', '123456789', '12345678901234', 'FR12345678901'],
    ['CLI-2026-002', 'particulier', 'Marie', 'Martin', '',
     'marie.martin@gmail.com', '0698765432', '45 avenue des Champs', '69001',
     'Lyon', 'FR', 'active', '', '', '', ''],
  ];

  if (format === 'csv') {
    const csvContent = [headers.join(';'), ...exampleData.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_clients.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    worksheet['!cols'] = headers.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, 'template_clients.xlsx');
  }
};

// ============================================================
// 📥 PARSING FICHIER IMPORT
// ============================================================

export const parseImportFile = async (
  file: File,
  type: 'prospects' | 'clients'
): Promise<{ rows: ParsedRow[]; headers: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result;
        if (!content) {
          reject(new Error('Fichier vide'));
          return;
        }

        let jsonData: any[][] = [];

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          // Fichier Excel
          const workbook = XLSX.read(content, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        } else {
          // Fichier CSV
          const text = content as string;
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          
          // Détection du séparateur
          const firstLine = lines[0];
          const separator = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
          
          jsonData = lines.map(line => {
            // Gestion des guillemets
            const values: string[] = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                  current += '"';
                  i++;
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (char === separator && !inQuotes) {
                values.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            values.push(current.trim());
            return values;
          });
        }

        if (jsonData.length < 2) {
          reject(new Error('Le fichier doit contenir au moins un en-tête et une ligne de données'));
          return;
        }

        const headers = jsonData[0].map(h => String(h).trim());
        const columns = type === 'prospects' ? PROSPECT_COLUMNS : CLIENT_COLUMNS;

        // Mapping des colonnes
        const columnMapping: Record<number, string> = {};
        headers.forEach((header, idx) => {
          const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          const column = columns.find(col => {
            const normalizedLabel = col.label.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normalizedLabel.includes(normalizedHeader) || normalizedHeader.includes(normalizedLabel);
          });
          if (column) {
            columnMapping[idx] = column.key;
          }
        });

        // Validation et parsing des lignes
        const rows: ParsedRow[] = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const rowData = jsonData[i];
          const data: any = {};
          const errors: string[] = [];

          // Remplir les données selon le mapping
          Object.entries(columnMapping).forEach(([idxStr, key]) => {
            const idx = parseInt(idxStr);
            data[key] = String(rowData[idx] || '').trim();
          });

          // Validation
          if (!data.firstName || data.firstName.trim() === '') {
            errors.push('Prénom obligatoire');
          }
          if (!data.lastName || data.lastName.trim() === '') {
            errors.push('Nom obligatoire');
          }
          if (data.email && !validateEmail(data.email)) {
            errors.push('Email invalide');
          }
          if (data.phone && !validatePhone(data.phone)) {
            errors.push('Téléphone invalide');
          }
          if (data.postalCode && !validatePostalCode(data.postalCode, data.country)) {
            errors.push('Code postal invalide');
          }

          // Statut par défaut
          if (!data.status) {
            data.status = type === 'prospects' ? 'new' : 'active';
          }

          rows.push({
            row: i + 1,
            data,
            errors,
            isValid: errors.length === 0,
          });
        }

        resolve({ rows, headers });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  });
};

// ============================================================
// 📥 IMPORT DANS APPWRITE
// ============================================================

export const importProspects = async (
  rows: ParsedRow[],
  teamId: string,
  appwriteTeamId: string,
  skipDuplicates: boolean = true
): Promise<ImportResult> => {
  const result: ImportResult = {
    total: rows.length,
    success: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
    duplicateDetails: [],
  };

  const perms = [
    Permission.read(Role.team(appwriteTeamId)),
    Permission.update(Role.team(appwriteTeamId)),
    Permission.delete(Role.team(appwriteTeamId)),
  ];

  // Récupérer les prospects existants pour détecter les doublons
  const existingRes = await databases.listDocuments(DATABASE_ID, 'prospects', [
    Query.equal('teamId', teamId),
    Query.limit(5000),
  ]);

  const existingEmails = new Set(
    existingRes.documents.map((d: any) => (d.email || '').toLowerCase())
  );
  const existingPhones = new Set(
    existingRes.documents.map((d: any) => (d.phone || '').replace(/\s/g, ''))
  );

  for (const row of rows) {
    if (!row.isValid) {
      result.errors++;
      row.errors.forEach(error => {
        result.errorDetails.push({ row: row.row, field: 'validation', message: error });
      });
      continue;
    }

    const data = row.data as ProspectData;

    // Détection doublons
    const email = (data.email || '').toLowerCase();
    const phone = (data.phone || '').replace(/\s/g, '');
    const isDuplicate = (email && existingEmails.has(email)) || (phone && existingPhones.has(phone));

    if (isDuplicate && skipDuplicates) {
      result.duplicates++;
      result.duplicateDetails.push({
        row: row.row,
        name: `${data.firstName} ${data.lastName}`,
        existingId: email || phone,
      });
      continue;
    }

    try {
      await databases.createDocument(
        DATABASE_ID,
        'prospects',
        ID.unique(),
        {
          teamId,
          firstName: data.firstName,
          lastName: data.lastName,
          companyName: data.companyName || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          postalCode: data.postalCode || '',
          city: data.city || '',
          country: data.country || 'FR',
          source: data.source || 'import',
          status: data.status || 'new',
          needs: data.needs || '',
          notes: data.notes || '',
          siren: data.siren || '',
          siret: data.siret || '',
          vatNumber: data.vatNumber || '',
        },
        perms
      );

      // Ajouter aux sets pour éviter les doublons dans le même import
      if (email) existingEmails.add(email);
      if (phone) existingPhones.add(phone);

      result.success++;
    } catch (error: any) {
      result.errors++;
      result.errorDetails.push({
        row: row.row,
        field: 'database',
        message: error.message || 'Erreur de création',
      });
    }
  }

  return result;
};

export const importClients = async (
  rows: ParsedRow[],
  teamId: string,
  appwriteTeamId: string,
  skipDuplicates: boolean = true
): Promise<ImportResult> => {
  const result: ImportResult = {
    total: rows.length,
    success: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
    duplicateDetails: [],
  };

  const perms = [
    Permission.read(Role.team(appwriteTeamId)),
    Permission.update(Role.team(appwriteTeamId)),
    Permission.delete(Role.team(appwriteTeamId)),
  ];

  const existingRes = await databases.listDocuments(DATABASE_ID, 'clients', [
    Query.equal('teamId', teamId),
    Query.limit(5000),
  ]);

  const existingEmails = new Set(
    existingRes.documents.map((d: any) => (d.email || '').toLowerCase())
  );
  const existingPhones = new Set(
    existingRes.documents.map((d: any) => (d.phone || '').replace(/\s/g, ''))
  );

  // Génération automatique du clientId si non fourni
  const currentYear = new Date().getFullYear();
  const prefix = `CLI-${currentYear}-`;
  let maxNum = 0;
  existingRes.documents.forEach((doc: any) => {
    if (doc.clientId && doc.clientId.startsWith(prefix)) {
      const num = parseInt(doc.clientId.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });

  for (const row of rows) {
    if (!row.isValid) {
      result.errors++;
      row.errors.forEach(error => {
        result.errorDetails.push({ row: row.row, field: 'validation', message: error });
      });
      continue;
    }

    const data = row.data as ClientData;

    const email = (data.email || '').toLowerCase();
    const phone = (data.phone || '').replace(/\s/g, '');
    const isDuplicate = (email && existingEmails.has(email)) || (phone && existingPhones.has(phone));

    if (isDuplicate && skipDuplicates) {
      result.duplicates++;
      result.duplicateDetails.push({
        row: row.row,
        name: `${data.firstName} ${data.lastName}`,
        existingId: email || phone,
      });
      continue;
    }

    // Génération du clientId
    maxNum++;
    const clientId = data.clientId || `${prefix}${String(maxNum).padStart(3, '0')}`;

    try {
      await databases.createDocument(
        DATABASE_ID,
        'clients',
        ID.unique(),
        {
          teamId,
          clientId,
          type: data.type || (data.companyName ? 'entreprise' : 'particulier'),
          firstName: data.firstName,
          lastName: data.lastName,
          companyName: data.companyName || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          postalCode: data.postalCode || '',
          city: data.city || '',
          country: data.country || 'FR',
          status: data.status || 'active',
          notes: data.notes || '',
          siren: data.siren || '',
          siret: data.siret || '',
          vatNumber: data.vatNumber || '',
        },
        perms
      );

      if (email) existingEmails.add(email);
      if (phone) existingPhones.add(phone);

      result.success++;
    } catch (error: any) {
      result.errors++;
      result.errorDetails.push({
        row: row.row,
        field: 'database',
        message: error.message || 'Erreur de création',
      });
    }
  }

  return result;
};