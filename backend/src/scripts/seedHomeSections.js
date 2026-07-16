import HomeSection from '../models/HomeSection.model.js';
import HomeBanner from '../models/HomeBanner.model.js';
import AppConfig from '../models/AppConfig.model.js';

export const seedHomepageSections = async () => {
    try {
        // 1. Seed Default Banners if not present
        const defaultBanners = [
            {
                name: 'Default Flash Sale Banner',
                title: 'Limited Time Deals',
                subtitle: 'Flash offers change daily. Grab them fast!',
                desktopImage: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Shop Flash Deals',
                ctaLink: '/search?flashSale=true',
                textColor: '#ffffff',
                buttonColor: '#7c3aed',
                backgroundColor: '#7c3aed',
                gradient: 'linear-gradient(135deg, #7c3aed 0%, #ff6161 100%)',
                overlayOpacity: 0.4,
                isDefault: true,
                sectionType: 'flash_sale',
                tags: ['default', 'flash_sale']
            },
            {
                name: 'Default Seasonal Campaign Banner',
                title: 'Summer Collection Showcase',
                subtitle: 'Explore active clothing and essential styles for the season.',
                desktopImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Explore Collection',
                ctaLink: '/search?newArrivals=true',
                textColor: '#ffffff',
                buttonColor: '#7c3aed',
                backgroundColor: '#7c3aed',
                gradient: 'linear-gradient(135deg, #7c3aed 0%, #10b981 100%)',
                overlayOpacity: 0.35,
                isDefault: true,
                sectionType: 'seasonal_collection',
                tags: ['default', 'seasonal']
            },
            {
                name: 'Default Promotional Banner',
                title: 'Exclusive Deals Only',
                subtitle: 'Discover trending brands at unbelievable rates.',
                desktopImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80',
                ctaText: 'View All Deals',
                ctaLink: '/offers',
                textColor: '#ffffff',
                buttonColor: '#ffffff',
                backgroundColor: '#7c3aed',
                gradient: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                overlayOpacity: 0.3,
                isDefault: true,
                sectionType: 'promotional_banner',
                tags: ['default', 'promotion']
            }
        ];

        for (const bannerData of defaultBanners) {
            const exists = await HomeBanner.findOne({ sectionType: bannerData.sectionType, isDefault: true });
            if (!exists) {
                await HomeBanner.create(bannerData);
                console.log(`✨ Created default HomeBanner for ${bannerData.sectionType}`);
            }
        }

        // 2. Seed Default Sections if not present
        const count = await HomeSection.countDocuments();
        if (count >= 3) {
            console.log('📦 Homepage sections already seeded.');
            return;
        }

        const defaultSections = [
            {
                key: 'flash_sale',
                sectionType: 'flash_sale',
                title: 'Super Flash Sale',
                subtitle: 'Limited time offers. Grab them before they are gone!',
                isActive: true,
                order: 1,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'carousel',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
            {
                key: 'seasonal_collection',
                sectionType: 'seasonal_collection',
                title: 'Seasonal Collection',
                subtitle: 'Explore our handpicked curation for this season.',
                isActive: true,
                order: 2,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'horizontal',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
            {
                key: 'promotional_banner',
                sectionType: 'promotional_banner',
                title: 'Exclusive Deals Only',
                subtitle: 'Discover trending brands at unbelievable rates.',
                isActive: true,
                order: 3,
                displayLimit: 1,
                minimumProducts: 0,
                layout: 'banner',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
        ];

        for (const sec of defaultSections) {
            const exists = await HomeSection.findOne({ key: sec.key });
            if (!exists) {
                await HomeSection.create(sec);
                console.log(`✨ Created default homepage section: ${sec.key}`);
            }
        }
        console.log('✅ Homepage sections seeding complete.');

        // 3. Seed Default Shop AppConfig
        const shopConfigExists = await AppConfig.findOne({ key: 'shop' });
        if (!shopConfigExists) {
            await AppConfig.create({
                key: 'shop',
                value: {
                    defaultSort: 'newest',
                    productsPerPage: 20,
                    defaultViewMode: 'grid',
                    quickFilters: [
                        { label: 'All', queryParams: '{}', isActive: true, order: 1 },
                        { label: 'New Arrivals', queryParams: '{"isNewArrival":"true"}', isActive: true, order: 2 },
                        { label: 'Best Sellers', queryParams: '{"sort":"popular"}', isActive: true, order: 3 },
                        { label: 'Top Rated', queryParams: '{"minRating":"4"}', isActive: true, order: 4 },
                        { label: 'Discounts', queryParams: '{"discount":"10"}', isActive: true, order: 5 },
                        { label: 'In Stock', queryParams: '{"stock":"in_stock"}', isActive: true, order: 6 }
                    ],
                    featuredCategories: [],
                    featuredBrands: [],
                    bannerAsset: null,
                    enabledFilters: {
                        category: true,
                        brand: true,
                        price: true,
                        rating: true,
                        discount: true,
                        stock: true,
                        vendor: true,
                        deliveryType: true,
                        color: true,
                        size: true
                    }
                }
            });
            console.log('✨ Seeded default shop configurations in AppConfig');
        }
    } catch (err) {
        console.error('❌ Failed to seed homepage sections:', err);
    }
};
