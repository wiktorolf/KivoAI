import { BrowserAPI } from '../browser/api.js';

export const EMPTY_PROFILE = {
    id: '',
    profileName: '',
    username: '',
    password: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    address1: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
};

export class AutofillProfileManager {
    static async getAllData() {
        const data = await BrowserAPI.getStorage(['kivo_autofill_profiles', 'kivo_active_profile_id']);
        let profiles = Array.isArray(data.kivo_autofill_profiles) ? data.kivo_autofill_profiles : [];
        let activeProfileId = data.kivo_active_profile_id || '';

        if (profiles.length === 0) {
            const initialProfile = {
                ...EMPTY_PROFILE,
                id: 'profile_default',
                profileName: 'Primary'
            };
            profiles = [initialProfile];
            activeProfileId = initialProfile.id;
            await BrowserAPI.setStorage({
                kivo_autofill_profiles: profiles,
                kivo_active_profile_id: activeProfileId
            });
        }

        if (!activeProfileId || !profiles.some((p) => p.id === activeProfileId)) {
            activeProfileId = profiles[0].id;
        }

        return { profiles, activeProfileId };
    }

    static async getActiveProfile() {
        const { profiles, activeProfileId } = await this.getAllData();
        const found = profiles.find((p) => p.id === activeProfileId);
        return found || profiles[0] || { ...EMPTY_PROFILE };
    }

    static async saveProfile(profile) {
        const { profiles, activeProfileId } = await this.getAllData();
        const id = profile.id || `profile_${Date.now()}`;

        const sanitized = {
            id,
            profileName: (profile.profileName || 'Unnamed Profile').trim(),
            username: (profile.username || '').trim(),
            firstName: (profile.firstName || '').trim(),
            middleName: (profile.middleName || '').trim(),
            lastName: (profile.lastName || '').trim(),
            email: (profile.email || '').trim(),
            phone: (profile.phone || '').trim(),
            address1: (profile.address1 || '').trim(),
            city: (profile.city || '').trim(),
            state: (profile.state || '').trim(),
            postalCode: (profile.postalCode || '').trim(),
            country: (profile.country || '').trim()
        };

        const existingIndex = profiles.findIndex((p) => p.id === id);
        if (existingIndex >= 0) {
            profiles[existingIndex] = sanitized;
        } else {
            profiles.push(sanitized);
        }

        await BrowserAPI.setStorage({
            kivo_autofill_profiles: profiles,
            kivo_active_profile_id: activeProfileId || id
        });
    }

    static async setActiveProfileId(profileId) {
        await BrowserAPI.setStorage({ kivo_active_profile_id: profileId });
    }

    static async deleteProfile(profileId) {
        const { profiles } = await this.getAllData();
        const filtered = profiles.filter((p) => p.id !== profileId);

        if (filtered.length === 0) {
            filtered.push({
                ...EMPTY_PROFILE,
                id: `profile_${Date.now()}`,
                profileName: 'Primary'
            });
        }

        const newActiveId = filtered[0].id;
        await BrowserAPI.setStorage({
            kivo_autofill_profiles: filtered,
            kivo_active_profile_id: newActiveId
        });

        return newActiveId;
    }

    static getComputedFullName(profile) {
        if (!profile) return '';
        const parts = [
            profile.firstName,
            profile.middleName,
            profile.lastName
        ].map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);

        return parts.join(' ');
    }

    static getAvailableTokens() {
        return [
            '{{username}}',
            '{{fullName}}',
            '{{firstName}}',
            '{{middleName}}',
            '{{lastName}}',
            '{{email}}',
            '{{phone}}',
            '{{address1}}',
            '{{city}}',
            '{{state}}',
            '{{postalCode}}',
            '{{country}}'
        ];
    }

    static resolveTemplateLocally(text, profile) {
        if (!text || typeof text !== 'string') return '';
        let resolved = text;

        const fullName = this.getComputedFullName(profile);

        const tokenMap = {
            '{{username}}': profile.username,
            '{{user}}': profile.username,
            '{{login}}': profile.username,
            '{{fullname}}': fullName,
            '{{name}}': fullName,
            '{{firstname}}': profile.firstName,
            '{{first_name}}': profile.firstName,
            '{{middlename}}': profile.middleName,
            '{{middle_name}}': profile.middleName,
            '{{lastname}}': profile.lastName,
            '{{last_name}}': profile.lastName,
            '{{surname}}': profile.lastName,
            '{{email}}': profile.email,
            '{{phone}}': profile.phone,
            '{{telephone}}': profile.phone,
            '{{address1}}': profile.address1,
            '{{address}}': profile.address1,
            '{{street}}': profile.address1,
            '{{city}}': profile.city,
            '{{state}}': profile.state,
            '{{province}}': profile.state,
            '{{postalcode}}': profile.postalCode,
            '{{zip}}': profile.postalCode,
            '{{zipcode}}': profile.postalCode,
            '{{country}}': profile.country
        };

        for (const [token, value] of Object.entries(tokenMap)) {
            const regex = new RegExp(token.replace(/[{}]/g, '\\$&'), 'gi');
            resolved = resolved.replace(regex, value || '');
        }

        return resolved;
    }
}
