import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { teams, databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';

interface TeamContextType {
  customTeamId: string | null;
  appwriteTeamId: string | null;
  teamName: string;
  teamRole: string;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMemberOf: (targetTeamId: string) => Promise<boolean>;
}

const TeamContext = createContext<TeamContextType | null>(null);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  const [customTeamId, setCustomTeamId] = useState<string | null>(null);
  const [appwriteTeamId, setAppwriteTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');
  const [teamRole, setTeamRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);

  const lastLoadedUserIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    const userId = user?.$id || null;

    // Anti-boucle : même user = pas de rechargement
    if (userId === lastLoadedUserIdRef.current) {
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    lastLoadedUserIdRef.current = userId;
    isLoadingRef.current = true;

    const loadTeam = async () => {
      if (!userId) {
        setCustomTeamId(null);
        setAppwriteTeamId(null);
        setTeamName('');
        setTeamRole('member');
        setLoading(false);
        isLoadingRef.current = false;
        return;
      }

      try {
        console.log('🔍 TeamContext: Recherche équipe pour userId:', userId);

        // ÉTAPE 1 : team_members
        let memberDoc: any = null;
        try {
          const memberRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
            Query.equal('userId', userId),
            Query.equal('status', 'active'),
            Query.limit(1),
          ]);

          if (memberRes.documents.length > 0) {
            memberDoc = memberRes.documents[0];
            console.log('✅ Membre trouvé:', memberDoc.$id);
          }
        } catch (memberError: any) {
          console.error('❌ Erreur team_members:', memberError.message);
        }

        // ÉTAPE 2 : Équipe custom
        if (memberDoc && memberDoc.teamId) {
          try {
            const teamDoc = await databases.getDocument(
              DATABASE_ID, 
              'teams', 
              memberDoc.teamId
            );

            const isOwner = teamDoc.ownerId === userId;

            console.log('✅ Équipe trouvée:', {
              customTeamId: teamDoc.$id,
              appwriteTeamId: teamDoc.appwriteTeamId,
              name: teamDoc.name,
              isOwner,
            });

            setCustomTeamId(teamDoc.$id);
            setAppwriteTeamId(teamDoc.appwriteTeamId || teamDoc.$id);
            setTeamName(teamDoc.name);

            if (isOwner) {
              setTeamRole('owner');
            } else if (memberDoc.roleId) {
              try {
                const roleDoc = await databases.getDocument(
                  DATABASE_ID, 
                  'roles', 
                  memberDoc.roleId
                );
                setTeamRole(roleDoc.name.toLowerCase());
              } catch {
                setTeamRole('member');
              }
            } else {
              setTeamRole('member');
            }

            setLoading(false);
            isLoadingRef.current = false;
            return;
          } catch (teamError: any) {
            console.error('❌ Erreur teams:', teamError.message);
          }
        }

        // ÉTAPE 3 : Fallback équipes natives
        try {
          const teamsList = await teams.list();
          if (teamsList.teams.length > 0) {
            const team = teamsList.teams[0];
            setCustomTeamId(null);
            setAppwriteTeamId(team.$id);
            setTeamName(team.name);
            setTeamRole('member');
            setLoading(false);
            isLoadingRef.current = false;
            return;
          }
        } catch (nativeError: any) {
          console.warn('⚠️ Équipes natives non disponibles:', nativeError.message);
        }

        setCustomTeamId(null);
        setAppwriteTeamId(null);
        setTeamName('');
        setTeamRole('member');
        setLoading(false);
        isLoadingRef.current = false;

      } catch (error: any) {
        console.error('❌ Erreur critique TeamContext:', error);
        setCustomTeamId(null);
        setAppwriteTeamId(null);
        setTeamName('');
        setTeamRole('member');
        setLoading(false);
        isLoadingRef.current = false;
      }
    };

    loadTeam();
  }, [user?.$id]);

  const isMemberOf = async (targetTeamId: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const memberRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
        Query.equal('userId', user.$id),
        Query.equal('teamId', targetTeamId),
        Query.equal('status', 'active'),
        Query.limit(1),
      ]);
      return memberRes.documents.length > 0;
    } catch (error) {
      console.error('Erreur vérification membership:', error);
      return false;
    }
  };

  return (
    <TeamContext.Provider
      value={{
        customTeamId,
        appwriteTeamId,
        teamName,
        teamRole,
        loading,
        isOwner: teamRole === 'owner',
        isAdmin: teamRole === 'owner' || teamRole === 'admin',
        isMemberOf,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}