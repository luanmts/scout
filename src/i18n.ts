// `en` remains the persisted/API value for existing installations. The actual
// locale used by Intl is en-US, and the selector names it explicitly.
export type UiLanguage = "en" | "pt-BR";

type Copy = Record<string, string>;

// UI copy is keyed by semantic phrases. User-provided names, URLs, evidence,
// drafts and Harvey Markdown never pass through this dictionary.
export const translations: Record<UiLanguage, Copy> = {
  en: {
    uiCloseMenu: "Close menu",
    uiOpenMenu: "Open menu",
    uiMainNavigation: "Main navigation",
    uiManageAndTrackYourProspectingCampaigns: "Manage and track your prospecting campaigns.",
    uiLeadBusiness: "Lead / business",
    uiEmailContact: "Email / contact",
    uiOpportunity: "Opportunity",
    uiActions: "Actions",
    uiLocationUnavailable: "Location unavailable",
    uiCallBusiness: "Call business",
    uiDetails: "Details",
    uiCampaignNavigation: "Campaign navigation",
    uiQualifyingLeads: "Qualifying leads",
    uiQualification: "Qualification",
    uiQualifiedTarget: "Qualified target",
    uiDiscovered: "Discovered",
    uiQualified: "Qualified",
    uiRemaining: "Remaining",
    uiQualifiedLeads: "Qualified leads",
    uiTheSharedLeadsWorkspaceStructureFilteredToThisCampaign: "The shared Leads Workspace structure, filtered to this campaign.",
    uiOpenFullLeadsWorkspace: "Open full Leads Workspace",
    uiNoQualifiedLeadsAreAvailableForThisCampaignYet: "No qualified leads are available for this campaign yet.",
    uiQualificationTracking: "Qualification tracking",
    uiAuditInProgressNow: "Audit in progress now",
    uiNoPendingOrBlockedCandidates: "No pending or blocked candidates.",
    uiActiveCampaigns: "Active campaigns",
    uiTrackCurrentWorkAndRealProgress: "Track current work and real progress.",
    uiCampaignSummary: "Campaign summary",
    uiSitesAnalyzed: "Sites analyzed",
    uiAllCampaigns: "All campaigns",
    uiCampaigns: "campaigns",
    uiQualifying: "Qualifying",
    uiCoverageExhausted: "Coverage exhausted",
    uiFailed: "Failed",
    uiTechnicalHistory: "Technical history",
    uiCampaign: "Campaign",
    uiWebsites: "Websites",
    uiOpenCampaign: "Open campaign",
    uiOpenCampaign2: "Open campaign",
    uiDescribeTheResearchObjective: "Describe the research objective",
    uiSmartOutreachUsesVerifiedCommercialEvidenceGeneralOutreachUses: "Smart Outreach uses verified commercial evidence. General Outreach uses business context without requiring a website problem.",
    uiMode: "Mode",
    uiDefaultService: "Default service",
    uiSaveOutreachSettings: "Save outreach settings",
    uiConfigurationIsSnapshottedFromTheGoogleMapsSearchUI: "Configuration is snapshotted from the Google Maps Search UI. Run the campaign again to reuse this territory and category.",
    uiArchiveCampaign: "Archive campaign",
    uiSent: "Sent",
    uiSelectInputs: "select inputs",
    uiVerifiedEvidence: "Verified evidence",
    uiUsedInSavedDraft: "Used in saved draft",
    uiMultipleRegions: "Multiple regions",
    uiRegion: "region",
    uiRegions: "regions",
    uiCity: "city",
    uiCities: "cities",
    uiWaitingForEngine: "Waiting for Scout Engine",
    uiCollecting: "Collecting",
    uiCompleted: "Completed",
    uiStarting: "Starting",
    uiDiscovery: "Discovery",
    uiProcessing: "Processing",
    uiSaving: "Saving",
    uiStage: "Stage",
    uiProgress: "Progress",
    uiCompanies: "Companies",
    uiAudits: "Audits",
    uiQualified2: "Qualified",
    uiContacts: "Contacts",
    uiOverview: "Overview",
    uiYourProspectingPerformanceInOnePlace: "Your prospecting performance in one place.",
    uiLoadingMetrics: "Loading metrics…",
    uiCouldNotLoadTheOverview: "Could not load the overview",
    uiCheckTheAPIConnectionAndTryAgain: "Check the API connection and try again.",
    uiTryAgain: "Try again",
    uiKeyMetrics: "Key metrics",
    uiCompaniesDiscovered: "Companies discovered",
    uiContactsFound: "Companies with contacts",
    uiCompaniesWithContactDetailsNote: "At least one contact detail is available",
    uiHighPriorityOpportunities: "High-priority opportunities",
    uiOpportunityDistribution: "Opportunity distribution",
    uiOpportunityRatingsForAnalyzedWebsites: "Opportunity ratings for analyzed websites.",
    uiOpportunitiesWillAppearAfterWebsitesAreAnalyzed: "Opportunities will appear after websites are analyzed.",
    uiWebsiteAudits: "Website audits",
    uiCompleted2: "Completed",
    uiPendingOrIncomplete: "Pending or incomplete",
    uiNoWebsiteAuditsRecordedYet: "No website audits recorded yet.",
    uiLeadsWithRecordedContact: "Leads with recorded contact",
    uiNoContactActivityRecordedYet: "No contact activity recorded yet.",
    uiRecentSearches: "Recent searches",
    uiClassifiedCompanies: "Classified companies",
    uiCommercialActivity: "Commercial activity",
    uiNextActions: "Next actions",
    uiNextActionsDescription: "Useful next steps based on the data available in Scout.",
    uiReviewPriorityOpportunities: "Review priority opportunities",
    uiReviewPriorityOpportunitiesDescription: "Open companies and focus on those with high opportunity scores.",
    uiViewCompanies: "View companies",
    uiStartASearch: "Start a search",
    uiStartASearchDescription: "Find new businesses by segment and location.",
    uiConfigure: "Set up",
    uiOpportunityChartDescription: "{total} classified companies: {high} high opportunity, {medium} medium, {low} low.",
    uiClassifiedShort: "classified",
    uiNoOpportunityData: "No opportunity classifications yet",
    uiRecentSearchesDescription: "Review recent campaigns and their current status.",
    uiViewAllCampaigns: "All campaigns",
    uiRecentSearchesTable: "Recent searches and campaign status",
    uiSearchName: "Search",
    uiSegmentAndLocation: "Segment and location",
    uiCreated: "Created",
    uiSearchStatus: "Status",
    uiWebsiteIntelligence: "Website intelligence",
    uiWebsiteIntelligenceDescription: "Coverage of website audits recorded in Scout.",
    uiWebsiteAuditsCompleted: "Website audits completed",
    uiAuditExplanationButton: "Explain website audit counts",
    uiAuditCoverage: "Website audit coverage",
    uiAuditCoverageValue: "{completed} of {total} considered audits completed, {percent}.",
    uiAuditTechnicalExplanation: "Cancelled audits are excluded from this proportion. Pending or incomplete includes queued, analyzing, partial, failed, restricted-access, and not-analyzed audits.",
    uiAuditDataWillAppearWhenAvailable: "Audit coverage will appear when data is available.",
    uiNoSearchesYet: "No searches yet",
    uiStartSearchToSeeResults: "Start a search to see campaign results here.",
    uiOpenYourLatestCampaigns: "Open your latest campaigns.",
    uiTrackProgressAcrossActiveSearches: "Track progress across active searches.",
    uiSetARealTerritory: "Set a real territory",
    uiChooseACountryPrioritizedRegionsOrAGroupOf: "Choose a country, prioritized regions, or a group of cities.",
    uiThereAreNoEligibleItemsToReprocess: "There are no eligible items to reprocess.",
    uiReprocessPendingFailed: "Reprocess pending & failed",
    uiLegacyRecordsWithoutAVerifiedImportRelation: "Legacy records without a verified import relation",
    uiOnly: "only",
    uiAllCollected: "All collected",
    uiCSVExportFollowsThisSelection: "CSV export follows this selection.",
    uiAwaitingAnalysis: "Awaiting analysis",
    uiAuditsRunning: "Audits running",
    uiAnalyzed: "Analyzed",
    uiPartialAudits: "Partial audits",
    uiOpportunityInsufficientEvidence: "Opportunity: insufficient evidence",
    uiFailedAudits: "Failed audits",
    uiHighOpportunity: "High opportunity",
    uiVerifiedContacts: "Verified contacts",
    uiAllAuditStatuses: "All audit statuses",
    uiNotAnalyzed: "Not analyzed",
    uiPartial: "Partial",
    uiCancelled: "Cancelled",
    uiAllOpportunities: "All opportunities",
    uiAllIssueSeverities: "All issue severities",
    uiHighIssues: "High issues",
    uiMediumIssues: "Medium issues",
    uiLowIssues: "Low issues",
    uiAnalyzing: "Analyzing",
    uiWebsiteQuality: "Website quality",
    uiWebsiteOpportunity: "Website opportunity",
    uiNoMeasurableIssuesWereDetectedInTheAnalyzedPages: "No measurable issues were detected in the analyzed pages.",
    uiPreparingVerifiedLeadIntelligenceAndGeneratingAPersonalizedDraft: "Preparing verified lead intelligence and generating a personalized draft.",
    uiGenerationCancelled: "Generation cancelled",
    uiGenerationTimedOut: "Generation timed out",
    uiCouldNotGenerateEmail: "Could not generate email",
    uiNoDraftWasSaved: "No draft was saved.",
    uiRegeneratingReadyDrafts: "Regenerating ready drafts",
    uiGeneratingPersonalizedEmails: "Generating personalized emails",
    uiPreparingPersonalizedDraftsFromVerifiedLeadIntelligence: "Preparing personalized drafts from verified lead intelligence.",
    uiCouldNotStartBatchGeneration: "Could not start batch generation",
    uiMarkAsSent: "Mark as sent",
    uiInRelationship: "In relationship",
    uiSentContacted: "Sent / contacted",
    uiInsufficientEvidence: "Insufficient evidence",
    uiUpdated: "updated",
    uiCampaignEmailsLanguageToneAndSignatureUseGlobalSettings: "Campaign emails — language, tone, and signature use global settings.",
    uiGenerateEmails: "Generate emails",
    uiRegenerateReadyDrafts: "Regenerate ready drafts",
    uiNoCompaniesWithSufficientEvidenceForOutreach: "No companies with sufficient evidence for Outreach.",
    uiAwaitingReply: "Awaiting reply",
    uiOpen: "Open",
    uiDaysWaiting: "days waiting",
    uiReview: "Review",
    uiPipelineIndicators: "Pipeline indicators",
    uiCompaniesInPipeline: "Companies in pipeline",
    uiCompaniesThatReplied: "Companies that replied",
    uiClosedDeals: "Closed deals",
    uiSearchCompany: "Search company...",
    uiSearchCompany2: "Search company",
    uiFilters: "Filters",
    uiView: "View",
    uiBoard: "Board",
    uiList: "List",
    uiAllStages: "All stages",
    uiChannel: "Channel",
    uiAllChannels: "All channels",
    uiIndustry: "Industry",
    uiAllIndustries: "All industries",
    uiOrigin: "Origin",
    uiAllOrigins: "All origins",
    uiRegion2: "Region",
    uiSearchRegion: "Search region",
    uiActiveFilters: "Active filters:",
    uiNoCompanies: "No companies",
    uiCompany: "Company",
    uiSegment: "Segment",
    uiWebsiteOpportunity2: "Website opportunity",
    uiFollowUp: "Follow-up",
    uiCouldNotLoadAccounts: "Could not load accounts.",
    uiCouldNotCompleteTheOperation: "Could not complete the operation.",
    uiFinishAuthorizationInTheNewWindow: "Finish authorization in the new window.",
    uiConnected: "Connected",
    uiAwaitingAuthorization: "Awaiting authorization",
    uiNeedsReconnection: "Needs reconnection",
    uiError: "Error",
    uiNotConnected: "Not connected",
    uiOpening: "Opening…",
    uiAddAnotherAccount: "Add another account",
    uiAccountAwaitingAuthorization: "Account awaiting authorization",
    uiTested: "Tested",
    uiTest: "Test",
    uiReconnect: "Reconnect",
    uiDisconnect: "Disconnect",
    uiEmailAccounts: "Email accounts",
    uiConnectAccountsToManageEmailFromGoogleCaptureNo: "Connect accounts to manage email from Scout. No messages are sent in this phase.",
    uiConnectYourGoogleAccountSecurely: "Connect your Google account securely.",
    uiFinishGoogleAuthorizationInTheNewWindow: "Finish Google authorization in the new window.",
    uiConnectYourZohoMailAccountSecurely: "Connect your Zoho Mail account securely.",
    uiFinishZohoAuthorizationInTheNewWindow: "Finish Zoho authorization in the new window.",
    uiAdvancedConfiguration: "Advanced configuration",
    uiUseSMTPIMAPWithAnAppPasswordOnlyWhen: "Use SMTP/IMAP with an app password only when Zoho OAuth is unavailable.",
    uiAppPassword: "App password",
    uiZohoAppPassword: "Zoho app password",
    uiTesting: "Testing…",
    uiTestSMTPIMAP: "Test SMTP/IMAP",
    uiManageSalesKnowledgeAndQualificationProfiles: "Manage sales knowledge and qualification profiles.",
    uiVersionedLocalRulesUseOnlyPersistedFactsChangesPreserve: "Versioned local rules use only persisted facts. Changes preserve prior scoring history.",
    uiRules: "rules",
    uiActive: "Active",
    uiInactive: "Inactive",
    uiLocalStorageCredentialsAndExports: "Local storage, credentials, and exports.",
    uiLocalStorageCredentialsAndExports2: "Local storage, credentials, and exports",
    uiExportsUseYourLocalSQLiteDatabaseEngine: "Exports use your local SQLite database. Scout Engine runs as a separate local service.",
    uiAndIsNeverModifiedByThisScreen: " and is never modified by this screen.",
    uiCredentialsForConnectedAccountsRemainInTheApplicationS: "Credentials for connected accounts remain in the application's protected local storage.",
    uiUseYourAuthorizedChatGPTAllowanceForOutreachStudioNo: "Use your authorized ChatGPT allowance for Outreach Studio. No paid API fallback is enabled.",
    uiConnectedChatGPTAccount: "Connected ChatGPT account",
    uiTheAuthenticatedAccountReturnedAnEmptyModelCatalogThis: "The authenticated account returned an empty model catalog. This is different from Luna being unavailable; no model can be selected until the catalog is available.",
    uiGPT56LunaIsUnavailableForThisAccount: "GPT-5.6 Luna is unavailable for this account. Select any available returned model manually.",
    description: "Description", conditions: "Conditions", auditsCompleted: "Audits completed", selectLead: "Select a lead", noModelSelected: "No model selected", translating: "Translating…", generating: "Generating…", connectChatGPTFirst: "Connect ChatGPT and select an available model in Settings before generating. Paid API fallback is disabled.", lunaUnavailable: "GPT-5.6 Luna is not available for this account. Select another model manually in Settings.", repeatOutreachBlocked: "Prior outreach exists for this company in another campaign or the global pipeline. Generation is blocked to prevent accidental repetition.",
    dashboard: "Dashboard", campaigns: "Campaigns", search: "Search", leads: "Leads", pipeline: "Outreach Pipeline", settings: "Settings", cohorts: "Cohorts", sendsNav: "Sends", sendActivityTitle: "Sending activity", sendActivitySubtitle: "Track the processing and history of your prospecting emails.", allLeadsAccess: "All leads and imports", noSendActivity: "No sending activity", noSendActivityHelp: "Messages prepared from a campaign will appear here.", settingsSubtitle: "Customize your prospecting workspace.", settingsCategories: "Settings categories", settingsGeneral: "General", settingsIntegrations: "Integrations", settingsAutomations: "Automations", settingsProspecting: "Prospecting", settingsIntelligence: "Sales intelligence", settingsSecurity: "Data and security",
    outreachPreferences: "Outreach preferences", interfaceLanguage: "Interface language", defaultEmailLanguage: "Default email language", writingTone: "Writing tone", emailStructure: "Email structure", subjectGuidelines: "Subject guidelines", subjectTemplate: "Optional subject template", signature: "Email signature", signatureEnabled: "Insert signature automatically", signaturePreview: "Live preview", savePreferences: "Save preferences", preferencesSaved: "Outreach preferences saved.", skillsLibrary: "Sales Skills Library", skillGuidance: "Enabled skills are loaded only for the tasks that need them. Imported Harvey skills retain MIT attribution.", saveSkill: "Save skill", serviceScope: "Service scope",
    campaignLeads: "Campaign leads", generateSelected: "Generate selected", searchCompanyEmail: "Search company or email", manualDraftStudio: "Manual draft studio", save: "Save", copy: "Copy", portuguese: "Português", markContacted: "Mark contacted", generate: "Generate", regenerate: "Regenerate", reviewStatus: "Review status", language: "Email language", tone: "Tone", service: "Service", subject: "Subject", body: "Body", reviewNotes: "Review notes", supportingEvidence: "Supporting evidence", noEvidence: "Personalization is limited because no scored evidence is available.", activeModel: "Active model", priorOutreach: "prior outreach", drafts: "drafts", noEmail: "No email recorded", translation: "Portuguese translation",
    notGenerated: "Not Generated", draft: "Draft", reviewed: "Reviewed", contacted: "Contacted", replied: "Replied", interested: "Interested", english: "English", professional: "Professional", warm: "Warm", direct: "Direct", consultative: "Consultative", optional: "Optional", name: "Name", role: "Role", company: "Company", website: "Website", contact: "Contact information", enabled: "Enabled", disabled: "Disabled",
    refresh: "Refresh", import: "Import", newSearch: "New search", dismiss: "Dismiss", prospectingWorkspace: "Prospecting workspace", buildTargetedSearch: "Build a targeted search", yourTerritoryInFocus: "Your territory, in focus.", allImportedLeads: "All your imported leads", localWorkspace: "Local workspace", connected: "Connected", notConnected: "Not connected", loading: "Loading…", requestFailed: "Request failed.", failed: "Needs attention", countryDirectoryUnavailable: "Country directory is unavailable.", industryCatalogUnavailable: "Industry catalog is unavailable.", workspaceSettingsUnavailable: "Workspace settings are unavailable.", cancel: "Cancel", canceled: "Canceled", cancelled: "Cancelled", close: "Close", details: "Details", more: "More", actions: "Actions", previous: "Previous", next: "Next", resetFilters: "Reset filters", noFilters: "No advanced filters applied", filtersActive: "filters active",
    searchScope: "Search scope", searchScopeHelp: "Prioritize regions, or switch to country-wide and city-level coverage.", territoryShortcuts: "Territory shortcuts", usa: "USA", canada: "Canada", europe: "Europe", worldwide: "Worldwide", entireCountry: "Entire Country", distributedKnownRegions: "Distributed across known regions", selectedRegions: "Selected Regions", preferredOneJobRegion: "Preferred · one job per region", selectedCities: "Selected Cities", oneJobCity: "One independent job per city", savedSearchName: "Saved search name", country: "Country", required: "required", stateProvinceRegion: "State / province / region", city: "City", uniqueLeadTarget: "Unique lead target", leadQualification: "Lead qualification", advancedSearchTerms: "Advanced custom search terms", selected: "Selected", add: "Add", searchIndustries: "Search industries…", relatedTerms: "Related terms", searchCandidatesNote: "Related Google Maps search terms are expanded automatically. These are discovery candidates, not official Google category claims.",
    currentTerritory: "Current territory", leadsStored: "Leads stored", missingWebsites: "Missing websites", qualified: "Qualified", extracting: "Extracting", searchActivity: "Search Activity", searchActivityHelp: "Server-side progress for the current or most recent collection run.", newSearchActivity: "No search activity yet", startTargetedSearch: "Start a targeted search to see live collection progress here.", jobsComplete: "jobs complete", discovered: "discovered", processed: "processed", uniqueLeads: "unique leads", existingDuplicates: "existing duplicates", alreadyStored: "already stored", repeatedInRun: "repeated in run", noLeadsMatch: "No leads match this view", noLeadsMatchHelp: "Try changing the search or advanced filters.",
    overview: "Overview", intelligence: "Intelligence", contacts: "Contacts", outreach: "Outreach", history: "History", icp: "ICP", allCampaigns: "All campaigns", researchCampaign: "Research campaign", runResearch: "Run research", openLeads: "Open leads", campaignStatistics: "Campaign statistics", searchConfiguration: "Search configuration", runsActivity: "Runs and activity", noRuns: "No runs have been recorded yet.", campaignLeadsHelp: "Distinct campaign membership backed by the global All Leads records.", openFullLeads: "Open full Leads Workspace", noCampaignLeads: "No leads have been imported for this campaign yet.", researchWorkspaces: "Research workspaces", campaignIndexHelp: "Every saved Google Maps search is a persistent research campaign.", newCampaign: "New campaign", activeCampaigns: "Active campaigns", uniqueMemberships: "Unique memberships", contactsFound: "Contacts found", highIcp: "High ICP", searchCampaigns: "Search campaigns", allStatuses: "All statuses", saved: "Saved", completed: "Completed", withErrors: "With errors", noCampaigns: "No campaigns found", noCampaignsHelp: "Create a saved research search to start a campaign.",
    cohortBuilder: "Cohort Builder", persistedSegmentation: "Persisted evidence segmentation", cohortHelp: "Dynamic cohorts update from existing lead, contact, signal and ICP data only.", newCohort: "New cohort", chooseField: "Choose field", remove: "Remove", condition: "+ Condition", nestedGroup: "+ Nested group", present: "Present", missingEvidence: "Missing evidence", verifiedContact: "Verified contact", value: "Value", whyCondition: "Why this condition", searchCohorts: "Search cohorts", matchingLeads: "Matching leads", dynamicMatches: "dynamic matches", noEnrichmentHere: "no enrichment or scraping runs here", matchedByConditions: "Matched by cohort conditions", saveCohort: "Save cohort", duplicate: "Duplicate", delete: "Delete", createCampaignFromCohort: "Create campaign from cohort", applyMatches: "Apply matches", leadsAddedToCampaign: "leads added to the campaign.",
    localConnection: "Local connection", scoutEngine: "Scout Engine", engineOnline: "Engine online", engineOffline: "Engine offline", engineChecking: "Checking engine…", contactDiscovery: "Contact Discovery", automaticContactDiscovery: "Automatic Contact Discovery", websiteIntelligence: "Website Intelligence", automaticHomepageAudits: "Automatic homepage audits", chatgptPlan: "ChatGPT plan", continueWithChatGPT: "Continue with ChatGPT", switchChatGPTAccount: "Switch ChatGPT account", chatgptSwitchHelp: "A new authorization window will ask you to sign in with the intended account.", disconnect: "Disconnect", refreshAvailableModels: "Refresh available models", selectModel: "Select a model", activeOutreachModel: "Active Outreach model", selectedModel: "Selected model", modelDiscoveryFailed: "Model discovery failed. Check the connection and refresh; no model was selected.",
    icpProfiles: "ICP scoring profiles", dataPolicy: "Data policy", skillContent: "Skill content", localOverlay: "Local overlay", savedLocally: "Saved locally.", noPublicContacts: "No public people or contact points are saved. This is not proof that the business has no contacts.", verifiedPublic: "Verified public", unverified: "Unverified", publicConfirmationNote: "Public confirmation does not imply mailbox deliverability.",
    notAnalyzed: "Not analyzed", analyzing: "Analyzing", auditFailed: "Audit failed", insufficientEvidence: "Insufficient evidence", awaitingAudit: "Awaiting website audit", locationUnavailable: "Location unavailable", dateUnavailable: "Date unavailable", unknownSource: "Unknown source", source: "Source", callBusiness: "Call business", viewHomepageAudit: "View homepage audit", contactSource: "Contact source", searchManually: "Search manually", addToPipeline: "Add to pipeline", inPipeline: "In pipeline", visitWebsite: "Visit website", noCommercialNotes: "No commercial notes yet", recordedActivity: "Recorded activity", noActivity: "No persisted activity exists for this lead yet.", businessSummary: "Business summary", quickActions: "Quick actions", businessContacts: "Business contacts", publicPeopleContactPoints: "Public people and contact points", leadWorkspace: "Lead workspace", leadSummary: "Lead summary", rating: "Rating", websiteQuality: "Website quality", websiteOpportunity: "Website opportunity", business: "Business", evidenceBasedScores: "Evidence-based opportunity scores", notScored: "Not scored yet.", persistedHomepageSignals: "Persisted homepage signals", noPersistedFindings: "No persisted findings are stored yet. Unavailable signals are not treated as negative findings.",
    toContact: "To Contact", proposalSent: "Proposal Sent", won: "Won", lost: "Lost", allStages: "All stages", allChannels: "All channels", allIndustries: "All industries", allOpportunities: "All opportunities", noWebsite: "No Website", needsReview: "Needs Review", needsRedesign: "Needs Redesign", brokenUx: "Broken UX", reviewLater: "Review Later", searchPipeline: "Search pipeline", pipelineBoard: "Board", pipelineList: "List", addActivity: "Add activity", channel: "Channel", notes: "Notes", lastContact: "Last contact", followUp: "Follow-up", saveChanges: "Save changes",
    emailCopied: "Email copied to clipboard.", couldNotCopyEmail: "Could not copy the email.", noEmailRecorded: "No email recorded", searchCancellationRequested: "Search cancellation requested. Collected leads were preserved.", auditCancelled: "Audit cancelled.",
    uiCoverage: "coverage",
    languageRegion: "Language & region", languageRegionHelp: "Choose the language of the interface and the default language for commercial emails independently.", englishUs: "English (United States)", portugueseBr: "Português (Brasil)", saveLanguageRegion: "Save email language", languageRegionUnsaved: "Email language has unsaved changes.",
    searchLocation: "Location", searchLocationHelp: "Where would you like to find companies?", shortcuts: "Shortcuts", searchCountryPlaceholder: "Enter a country name", noCountryFound: "No country found.", selectCountry: "Select a country from the suggestions.", selectEuropeanCountry: "Choose a European country.", noRegionFound: "No region found.", selectRegionFirst: "Select a state before choosing a city.", noCityFound: "No city found in this region.", regionsJobs: "Selected regions · {count} jobs", citiesJobs: "Selected cities · {count} jobs", marketSegment: "Market segment", marketSegmentHelp: "What kind of company are you looking for?", whatToSearch: "What to search", marketSegmentHint: "Select the segments that define your list.", advancedTermsHelp: "Use these terms when a category needs more context. They are combined with the selected segment.", customCategory: "Optional custom category", customCategoryHint: "Use when the catalog is not suitable", targetHeading: "Search target", targetHelp: "The target counts qualified companies, not just discovered companies.", qualifiedTarget: "Qualified lead target", qualifiedOption: "{count} qualified", qualifiedTargetHelp: "Only qualified leads count toward this target.", searchSummary: "Search summary", searchSummaryHelp: "Review the configuration before continuing.", notSelected: "Not selected", coverage: "Coverage", countryWide: "Entire country", noSelection: "None selected", segments: "Segments", noSegment: "No segment", regionsShort: "Regions", citiesShort: "Cities", estimatedJobs: "Estimated jobs", qualifiedGoal: "Qualified target", selectSegment: "Select a segment.", addRegionHint: "Add a region.", addCityHint: "Add a city.", saveForLater: "Save for later", startSearch: "Start search", resultsInCampaigns: "Results will be available in Campaigns.", regionalJobs: "regional jobs", jobsByRegion: "{count} jobs by region", jobsByCity: "{count} jobs by city", noStateFirst: "Select a state first.",
    newSearchSubtitle: "Define your market and find new business opportunities.", crmSubtitle: "Track your contacts and business opportunities.", campaignEmails: "Campaign emails", campaignEmailsHelp: "Generate and review the drafts below, then prepare a safe sending schedule.",
    outboxPendingReview: "Awaiting review", outboxApproved: "Scheduled", outboxSending: "Sending", outboxSent: "Sent", outboxRejected: "Rejected", outboxCancelled: "Cancelled", outboxFailed: "Failed", outboxWaitingActivation: "Blocked until sending is enabled", outboxPaused: "Paused globally", outboxWaitingSchedule: "Awaiting scheduled time", outboxReady: "Ready to send", outboxProcessing: "Processing now", outboxTerminal: "Closed", sendingEnabled: "Sending enabled", sendingDisabled: "Sending disabled", resume: "Resume", pause: "Pause", noConnectedAccounts: "No connected accounts. Connect an account in Settings.", scheduledCount: "Scheduled", sentCount: "Sent", failedCount: "Failed", searchRecipient: "Search recipient or subject", filterStatus: "Filter by status", removeSelected: "Remove selected", recipient: "To", account: "account", attemptsOne: "{count} attempt", attemptsOther: "{count} attempts", uncertainResult: "uncertain result", testMessage: "Test · ", unavailableState: "State unavailable", noSubject: "No subject", sentAt: "Sent on {date}", plannedFor: "Scheduled for {date}", approve: "Approve", chooseForRemoval: "Select {subject} for removal", dailyLimit: "Limit {count}/day", sendPermissionPending: "Send permission pending", onlyEnableSendingBackend: "Enable sending in the backend after validation", couldNotLoadSends: "Could not load sending activity.", couldNotUpdateSchedule: "Could not update the schedule.", couldNotClearSelected: "Could not remove selected items.", sendingRemainsDisabled: "The backend keeps sending disabled until explicitly authorized.", couldNotChangePause: "Could not change the global pause.", removedOutboxItems: "{count} items removed from the sending queue.",
    createTestEmail: "Create test email", testEmailHelp: "The recipient must be authorized in the backend. Sending remains blocked.", senderAccount: "Sender account", authorizedRecipient: "Authorized recipient", message: "Message", noTestRecipients: "No test recipient is authorized. Configure", inBackend: "in the backend.", testEmailReview: "This will be created as Awaiting review and pass through the same sending gate.", prepareSending: "Prepare sending", prepareSendingHelp: "Select ready drafts and set a schedule. Sending will not start now.", quantity: "Quantity", messageInterval: "Interval between messages", minutes: "{count} minutes", oneHour: "1 hour", optionalStart: "Start (optional)", senderAccounts: "Sender accounts", connectAccountFirst: "Connect an account in Settings before scheduling.", availableMessages: "Available messages", selectedCount: "{count} selected", noEligibleMessages: "There are no messages with eligible recipients in this campaign.", gateWillVerify: "The gate will continue to check recipients, duplicates, and permissions in the backend.", preparing: "Preparing…", addToSendingQueue: "Add to sending queue", couldNotPrepareSchedule: "Could not prepare the schedule.", couldNotPrepareQueue: "Could not prepare the sending queue.", reconnectToSend: "Reconnect to grant sending permission", sendingStillDisabled: "Sending remains disabled.", couldNotLoadTestRecipients: "Could not load authorized test recipients.", testPrepared: "Test message prepared in the sending queue. No message was transmitted.", couldNotPrepareTest: "Could not prepare the test message.", sendingAuthorized: "sending authorized", reconnectRequired: "reconnection required", prepareTest: "Prepare test", testSubjectDefault: "Test message — Scout", testBodyDefault: "Scout test message.",
    skippedMessages: "{count} skipped: {reasons}", stagedMessages: "{count} messages prepared in the sending queue.",
    generationProcessed: "leads processed", generationComplete: "complete", generationFailed: "failed", cancelGeneration: "Cancel generation", retry: "Try again", generationRemainingCancelled: "Remaining generation was cancelled.", generationPartial: "Some emails could not be generated. Completed drafts were preserved.", generationSaved: "Personalized drafts saved.", generationPreparing: "Preparing drafts with verified lead intelligence.", couldNotLoadSendAccounts: "Could not load sending accounts.",
    campaignsShown: "Showing {count} campaigns", connectedAccountOne: "{count} connected account", connectedAccountOther: "{count} connected accounts", recoveryPreview: "Preview: {audits} eligible audits and {contacts} eligible contact discoveries. Access-restricted sites are excluded. Start reprocessing?", recoveryQueued: "{audits} audits and {contacts} contact discoveries were queued.", qualificationProgressSummary: "{audits} audits · {visual} Visual & UX reviews · {incomplete} incomplete", candidateProgressSummary: "{active} being checked now · {pending} pending · {blocked} blocked", batchStatus: "Batch {status}", batchSummary: "{completed}/{total} complete · {failed} failed", evidenceConfidence: "{percent} confidence", campaignCountOne: "{count} campaign", campaignCountOther: "{count} campaigns",
    cohortSaved: "Cohort saved.", draftSaved: "Draft saved.", contactedInCampaign: "Marked contacted for this campaign. The global pipeline was not changed.",
    smartOutreach: "Smart Outreach", generalOutreach: "General Outreach",
    notStarted: "Not started",
    leadStatusNew: "New", leadStatusReviewing: "Reviewing", leadStatusQualified: "Qualified", leadStatusArchived: "Archived", channelNotSelected: "channel not selected",
    searchLeads: "Search leads", globalEmails: "Global emails", websiteNotListedHelp: "No website URL was listed in Google Maps. This does not confirm that the business has no website.", industryExample: "Example: commercial refrigeration", subjectIdeaExample: "Idea for {{company}}", structureExample: "Context, value, question", serviceExample: "Website development, SEO…", inCrm: "In CRM",
    settingsIntegrationHelp: "Manage services connected to Scout.", settingsAutomationHelp: "Control automatic tasks and their local queues.", settingsProspectingHelp: "Set draft writing and your commercial signature.", settingsIntelligenceHelp: "Manage sales knowledge and qualification profiles.", settingsSecurityHelp: "Local storage, credentials, and exports.", engineDescription: "Local business discovery and collection service.", unavailable: "Unavailable", automationContactHelp: "Queues only newly imported leads. Existing leads are not reprocessed.", automationAuditHelp: "Queues newly imported leads with public websites; existing records stay unchanged.", persistentQueue: "Persistent local queue", concurrentDiscoveries: "{count} concurrent discoveries", browserQueue: "Bounded local browser queue · homepage-only evidence", emailWritingHelp: "Preferences used when preparing emails.", signatureHelp: "Customize and preview the signature for drafts.", signatureEdit: "Edit signature and preview", signatureEmpty: "Your signature will appear here.", templateHint: "Use {{company}}, {{category}} or {{city}}.", intelligenceProfilesActive: "{active} of {total} profiles active", rulesCountOne: "{count} rule", rulesCountOther: "{count} rules", active: "Active", inactive: "Inactive", skillsActive: "{active} enabled · {total} total", dataStorageHelp: "Exports use your local SQLite database. Scout Engine runs as a separate local service.", dataStorageSuffix: "and is never modified by this screen.", protectedCredentials: "Credentials for connected accounts remain in the application's protected local storage.", saveSkillFailed: "Could not save skill.",
  },
  "pt-BR": {
    uiCloseMenu: "Fechar menu",
    uiOpenMenu: "Abrir menu",
    uiMainNavigation: "Navegação principal",
    uiManageAndTrackYourProspectingCampaigns: "Gerencie e acompanhe suas campanhas de prospecção.",
    uiLeadBusiness: "Lead / empresa",
    uiEmailContact: "Email / contato",
    uiOpportunity: "Oportunidade",
    uiActions: "Ações",
    uiLocationUnavailable: "Localização indisponível",
    uiCallBusiness: "Ligar para a empresa",
    uiDetails: "Detalhes",
    uiCampaignNavigation: "Navegação da campanha",
    uiQualifyingLeads: "Qualificando leads",
    uiQualification: "Qualificação",
    uiQualifiedTarget: "Meta qualificada",
    uiDiscovered: "Descobertas",
    uiQualified: "Qualificadas",
    uiRemaining: "Restantes",
    uiQualifiedLeads: "Leads qualificados",
    uiTheSharedLeadsWorkspaceStructureFilteredToThisCampaign: "A mesma estrutura do Leads Workspace, filtrada por esta campanha.",
    uiOpenFullLeadsWorkspace: "Abrir espaço de Leads",
    uiNoQualifiedLeadsAreAvailableForThisCampaignYet: "Ainda não há leads qualificados nesta campanha.",
    uiQualificationTracking: "Acompanhamento da qualificação",
    uiAuditInProgressNow: "Auditoria em andamento agora",
    uiNoPendingOrBlockedCandidates: "Nenhum candidato pendente ou impedido.",
    uiActiveCampaigns: "Campanhas em andamento",
    uiTrackCurrentWorkAndRealProgress: "Acompanhe o trabalho atual e o progresso real.",
    uiCampaignSummary: "Resumo das campanhas",
    uiSitesAnalyzed: "Sites analisados",
    uiAllCampaigns: "Todas as campanhas",
    uiCampaigns: "campanhas",
    uiQualifying: "Qualificando",
    uiCoverageExhausted: "Cobertura esgotada",
    uiFailed: "Falhou",
    uiTechnicalHistory: "Histórico técnico",
    uiCampaign: "Campanha",
    uiWebsites: "Sites",
    uiOpenCampaign: "Ação de navegação",
    uiOpenCampaign2: "Abrir campanha",
    uiDescribeTheResearchObjective: "Descreva o objetivo da pesquisa",
    uiSmartOutreachUsesVerifiedCommercialEvidenceGeneralOutreachUses: "Smart Outreach usa evidências comerciais verificadas. General Outreach usa o contexto da empresa sem exigir um problema no site.",
    uiMode: "Modo",
    uiDefaultService: "Serviço padrão",
    uiSaveOutreachSettings: "Salvar configurações de outreach",
    uiConfigurationIsSnapshottedFromTheGoogleMapsSearchUI: "A configuração é registrada a partir da interface de pesquisa do Google Maps. Execute a campanha novamente para reutilizar este território e categoria.",
    uiArchiveCampaign: "Arquivar campanha",
    uiSent: "Enviado",
    uiSelectInputs: "selecione as entradas",
    uiVerifiedEvidence: "Evidência verificada",
    uiUsedInSavedDraft: "Usado no rascunho salvo",
    uiMultipleRegions: "múltiplas regiões",
    uiRegion: "região",
    uiRegions: "regiões",
    uiCity: "cidade",
    uiCities: "cidades",
    uiWaitingForEngine: "Aguardando Scout Engine",
    uiCollecting: "Coletando",
    uiCompleted: "Concluída",
    uiStarting: "Iniciando",
    uiDiscovery: "Descoberta",
    uiProcessing: "Processando",
    uiSaving: "Salvando",
    uiStage: "Etapa",
    uiProgress: "Progresso",
    uiCompanies: "Empresas",
    uiAudits: "Auditorias",
    uiQualified2: "Qualificados",
    uiContacts: "Contatos",
    uiOverview: "Visão geral",
    uiYourProspectingPerformanceInOnePlace: "Seu desempenho de prospecção em um só lugar.",
    uiLoadingMetrics: "Carregando indicadores…",
    uiCouldNotLoadTheOverview: "Não foi possível carregar o Painel",
    uiCheckTheAPIConnectionAndTryAgain: "Verifique a conexão com a API e tente novamente.",
    uiTryAgain: "Tentar novamente",
    uiKeyMetrics: "Indicadores principais",
    uiCompaniesDiscovered: "Empresas descobertas",
    uiContactsFound: "Empresas com dados de contato",
    uiCompaniesWithContactDetailsNote: "Com pelo menos um dado de contato",
    uiHighPriorityOpportunities: "Oportunidades de alta prioridade",
    uiOpportunityDistribution: "Distribuição de oportunidades",
    uiOpportunityRatingsForAnalyzedWebsites: "Classificações de oportunidade dos websites analisados.",
    uiOpportunitiesWillAppearAfterWebsitesAreAnalyzed: "As oportunidades aparecerão após a análise dos websites.",
    uiWebsiteAudits: "Auditorias de websites",
    uiCompleted2: "Concluídas",
    uiPendingOrIncomplete: "Pendentes ou incompletas",
    uiNoWebsiteAuditsRecordedYet: "Nenhuma auditoria registrada até agora.",
    uiLeadsWithRecordedContact: "Leads com contato registrado",
    uiNoContactActivityRecordedYet: "Nenhum contato registrado ainda.",
    uiRecentSearches: "Pesquisas recentes",
    uiClassifiedCompanies: "Empresas classificadas",
    uiCommercialActivity: "Atividade comercial",
    uiNextActions: "Próximas ações",
    uiNextActionsDescription: "Atalhos para avançar a operação com os dados disponíveis no Scout.",
    uiReviewPriorityOpportunities: "Revisar oportunidades prioritárias",
    uiReviewPriorityOpportunitiesDescription: "Abra as empresas e priorize as classificadas com alta oportunidade.",
    uiViewCompanies: "Ver empresas",
    uiStartASearch: "Iniciar uma pesquisa",
    uiStartASearchDescription: "Encontre novas empresas por segmento e região.",
    uiConfigure: "Configurar",
    uiOpportunityChartDescription: "{total} empresas classificadas: {high} com alta oportunidade, {medium} média e {low} baixa.",
    uiClassifiedShort: "classificadas",
    uiNoOpportunityData: "Ainda não há classificações de oportunidade",
    uiRecentSearchesDescription: "Acompanhe as campanhas recentes e seus status atuais.",
    uiViewAllCampaigns: "Todas as campanhas",
    uiRecentSearchesTable: "Pesquisas recentes e status das campanhas",
    uiSearchName: "Pesquisa",
    uiSegmentAndLocation: "Segmento e localização",
    uiCreated: "Criada em",
    uiSearchStatus: "Status",
    uiWebsiteIntelligence: "Inteligência de websites",
    uiWebsiteIntelligenceDescription: "Cobertura das auditorias de websites registradas no Scout.",
    uiWebsiteAuditsCompleted: "Auditorias de websites concluídas",
    uiAuditExplanationButton: "Explicar os totais das auditorias de websites",
    uiAuditCoverage: "Cobertura das auditorias de websites",
    uiAuditCoverageValue: "{completed} de {total} auditorias consideradas foram concluídas, {percent}.",
    uiAuditTechnicalExplanation: "Auditorias canceladas são excluídas desta proporção. Pendentes ou incompletas inclui auditorias em fila, em análise, parciais, com falha, com acesso restrito ou ainda não analisadas.",
    uiAuditDataWillAppearWhenAvailable: "A cobertura das auditorias aparecerá quando houver dados.",
    uiNoSearchesYet: "Nenhuma pesquisa ainda",
    uiStartSearchToSeeResults: "Inicie uma pesquisa para ver os resultados das campanhas aqui.",
    uiOpenYourLatestCampaigns: "Acesse suas campanhas mais recentes.",
    uiTrackProgressAcrossActiveSearches: "Acompanhe o progresso das pesquisas ativas.",
    uiSetARealTerritory: "Defina um território",
    uiChooseACountryPrioritizedRegionsOrAGroupOf: "Escolha um país, regiões prioritárias ou um grupo de cidades.",
    uiThereAreNoEligibleItemsToReprocess: "Não há itens elegíveis para reprocessar.",
    uiReprocessPendingFailed: "Reprocessar pendentes e falhos",
    uiLegacyRecordsWithoutAVerifiedImportRelation: "Registros antigos sem relação de importação verificada",
    uiOnly: "somente",
    uiAllCollected: "Todos coletados",
    uiCSVExportFollowsThisSelection: "A exportação CSV segue esta seleção.",
    uiAwaitingAnalysis: "Aguardando análise",
    uiAuditsRunning: "Auditorias em execução",
    uiAnalyzed: "Analisados",
    uiPartialAudits: "Auditorias parciais",
    uiOpportunityInsufficientEvidence: "Oportunidade: evidência insuficiente",
    uiFailedAudits: "Auditorias com falha",
    uiHighOpportunity: "Alta oportunidade",
    uiVerifiedContacts: "Contatos verificados",
    uiAllAuditStatuses: "Todos os status de auditoria",
    uiNotAnalyzed: "Não analisado",
    uiPartial: "Parcial",
    uiCancelled: "Cancelada",
    uiAllOpportunities: "Todas as oportunidades",
    uiAllIssueSeverities: "Todas as severidades",
    uiHighIssues: "Problemas altos",
    uiMediumIssues: "Problemas médios",
    uiLowIssues: "Problemas baixos",
    uiAnalyzing: "Analisando",
    uiWebsiteQuality: "Qualidade do site",
    uiWebsiteOpportunity: "Oportunidade do site",
    uiNoMeasurableIssuesWereDetectedInTheAnalyzedPages: "Nenhum problema mensurável foi detectado nas páginas analisadas.",
    uiPreparingVerifiedLeadIntelligenceAndGeneratingAPersonalizedDraft: "Preparando as evidências verificadas e o rascunho personalizado.",
    uiGenerationCancelled: "Geração cancelada",
    uiGenerationTimedOut: "Tempo de geração esgotado",
    uiCouldNotGenerateEmail: "Não foi possível gerar o e-mail",
    uiNoDraftWasSaved: "Nenhum rascunho foi salvo.",
    uiRegeneratingReadyDrafts: "Regenerando rascunhos prontos",
    uiGeneratingPersonalizedEmails: "Gerando e-mails personalizados",
    uiPreparingPersonalizedDraftsFromVerifiedLeadIntelligence: "Preparando rascunhos com inteligência verificada dos leads.",
    uiCouldNotStartBatchGeneration: "Não foi possível iniciar a geração em lote",
    uiMarkAsSent: "Marcar como enviado",
    uiInRelationship: "Em relacionamento",
    uiSentContacted: "Enviado / contatado",
    uiInsufficientEvidence: "Evidência insuficiente",
    uiUpdated: "atualizado",
    uiCampaignEmailsLanguageToneAndSignatureUseGlobalSettings: "E-mails da campanha — idioma, tom e assinatura usam as configurações globais.",
    uiGenerateEmails: "Gerar e-mails",
    uiRegenerateReadyDrafts: "Regenerar rascunhos prontos",
    uiNoCompaniesWithSufficientEvidenceForOutreach: "Nenhuma empresa com evidência suficiente para Outreach.",
    uiAwaitingReply: "Aguardando resposta",
    uiOpen: "Abrir",
    uiDaysWaiting: "dias aguardando",
    uiReview: "Revisar",
    uiPipelineIndicators: "Indicadores do pipeline",
    uiCompaniesInPipeline: "Total de empresas no pipeline",
    uiCompaniesThatReplied: "Empresas que responderam",
    uiClosedDeals: "Negociações fechadas",
    uiSearchCompany: "Buscar empresa...",
    uiSearchCompany2: "Buscar empresa",
    uiFilters: "Filtros",
    uiView: "Visualização",
    uiBoard: "Kanban",
    uiList: "Lista",
    uiAllStages: "Todas as etapas",
    uiChannel: "Canal",
    uiAllChannels: "Todos os canais",
    uiIndustry: "Indústria",
    uiAllIndustries: "Todas as indústrias",
    uiOrigin: "Origem",
    uiAllOrigins: "Todas as origens",
    uiRegion2: "Região",
    uiSearchRegion: "Buscar região",
    uiActiveFilters: "Filtros ativos:",
    uiNoCompanies: "Nenhuma empresa",
    uiCompany: "Empresa",
    uiSegment: "Segmento",
    uiWebsiteOpportunity2: "Oportunidade no site",
    uiFollowUp: "Acompanhamento",
    uiCouldNotLoadAccounts: "Não foi possível carregar as contas.",
    uiCouldNotCompleteTheOperation: "Não foi possível concluir a operação.",
    uiFinishAuthorizationInTheNewWindow: "Finalize a autorização na nova janela.",
    uiConnected: "Conectada",
    uiAwaitingAuthorization: "Aguardando autorização",
    uiNeedsReconnection: "Reconectar",
    uiError: "Erro",
    uiNotConnected: "Não conectado",
    uiOpening: "Abrindo…",
    uiAddAnotherAccount: "Adicionar outra conta",
    uiAccountAwaitingAuthorization: "Conta aguardando autorização",
    uiTested: "Testada",
    uiTest: "Testar",
    uiReconnect: "Reconectar",
    uiDisconnect: "Desconectar",
    uiEmailAccounts: "Contas de e-mail",
    uiConnectAccountsToManageEmailFromGoogleCaptureNo: "Conecte suas contas para gerenciar e-mails pelo Scout. Nenhuma mensagem é enviada nesta fase.",
    uiConnectYourGoogleAccountSecurely: "Conecte sua conta Google com segurança.",
    uiFinishGoogleAuthorizationInTheNewWindow: "Finalize a autorização do Google na nova janela.",
    uiConnectYourZohoMailAccountSecurely: "Conecte sua conta Zoho Mail por autorização segura.",
    uiFinishZohoAuthorizationInTheNewWindow: "Finalize a autorização do Zoho na nova janela.",
    uiAdvancedConfiguration: "Configuração avançada",
    uiUseSMTPIMAPWithAnAppPasswordOnlyWhen: "Use SMTP/IMAP com senha de aplicativo somente quando o OAuth do Zoho não estiver disponível.",
    uiAppPassword: "Senha de aplicativo",
    uiZohoAppPassword: "Senha de aplicativo Zoho",
    uiTesting: "Testando…",
    uiTestSMTPIMAP: "Testar SMTP/IMAP",
    uiManageSalesKnowledgeAndQualificationProfiles: "Gerencie o conhecimento comercial e os perfis de qualificação.",
    uiVersionedLocalRulesUseOnlyPersistedFactsChangesPreserve: "Regras locais e versionadas usam apenas fatos persistidos. Alterações preservam o histórico das pontuações anteriores.",
    uiRules: "regras",
    uiActive: "Ativo",
    uiInactive: "Inativo",
    uiLocalStorageCredentialsAndExports: "Armazenamento local, credenciais e exportações.",
    uiLocalStorageCredentialsAndExports2: "Armazenamento local, credenciais e exportações",
    uiExportsUseYourLocalSQLiteDatabaseEngine: "As exportações usam seu banco SQLite local. O Scout Engine é executado como um serviço local separado.",
    uiAndIsNeverModifiedByThisScreen: " e não é alterado por esta tela.",
    uiCredentialsForConnectedAccountsRemainInTheApplicationS: "As credenciais das contas conectadas ficam no armazenamento local protegido da aplicação.",
    uiUseYourAuthorizedChatGPTAllowanceForOutreachStudioNo: "Use sua cota autorizada do ChatGPT no Outreach Studio. Não há fallback para API paga.",
    uiConnectedChatGPTAccount: "Conta ChatGPT conectada",
    uiTheAuthenticatedAccountReturnedAnEmptyModelCatalogThis: "A conta autenticada retornou um catálogo de modelos vazio. Isso é diferente de o Luna estar indisponível; nenhum modelo pode ser selecionado até o catálogo estar disponível.",
    uiGPT56LunaIsUnavailableForThisAccount: "GPT-5.6 Luna não está disponível para esta conta. Selecione manualmente qualquer modelo retornado.",
    description: "Descrição", conditions: "Condições", auditsCompleted: "Auditorias concluídas", selectLead: "Selecione um lead", noModelSelected: "Nenhum modelo selecionado", translating: "Traduzindo…", generating: "Gerando…", connectChatGPTFirst: "Conecte o ChatGPT e selecione um modelo disponível em Configurações antes de gerar. O fallback para API paga está desativado.", lunaUnavailable: "GPT-5.6 Luna não está disponível para esta conta. Selecione outro modelo manualmente em Configurações.", repeatOutreachBlocked: "Já existe outreach para esta empresa em outra campanha ou no pipeline global. A geração foi bloqueada para evitar repetição acidental.",
    dashboard: "Painel", campaigns: "Campanhas", search: "Pesquisa", leads: "Leads", pipeline: "Pipeline de outreach", settings: "Configurações", cohorts: "Coortes", sendsNav: "Envios", sendActivityTitle: "Atividade de envios", sendActivitySubtitle: "Acompanhe o processamento e o histórico dos seus e-mails de prospecção.", allLeadsAccess: "Todos os leads e importações", noSendActivity: "Nenhuma atividade de envio", noSendActivityHelp: "Mensagens preparadas a partir de uma campanha aparecerão aqui.", settingsSubtitle: "Personalize seu ambiente de prospecção.", settingsCategories: "Categorias de configurações", settingsGeneral: "Geral", settingsIntegrations: "Integrações", settingsAutomations: "Automações", settingsProspecting: "Prospecção", settingsIntelligence: "Inteligência comercial", settingsSecurity: "Dados e segurança",
    outreachPreferences: "Preferências de outreach", interfaceLanguage: "Idioma da interface", defaultEmailLanguage: "Idioma padrão dos emails", writingTone: "Tom de escrita", emailStructure: "Estrutura do email", subjectGuidelines: "Orientações do assunto", subjectTemplate: "Modelo opcional de assunto", signature: "Assinatura de email", signatureEnabled: "Inserir assinatura automaticamente", signaturePreview: "Pré-visualização", savePreferences: "Salvar preferências", preferencesSaved: "Preferências de outreach salvas.", skillsLibrary: "Biblioteca de Skills de vendas", skillGuidance: "As skills ativas são carregadas apenas nas tarefas que precisam delas. As skills importadas do Harvey mantêm a atribuição MIT.", saveSkill: "Salvar skill", serviceScope: "Escopo de serviço",
    campaignLeads: "Leads da campanha", generateSelected: "Gerar selecionados", searchCompanyEmail: "Buscar empresa ou email", manualDraftStudio: "Estúdio de rascunhos", save: "Salvar", copy: "Copiar", portuguese: "Português", markContacted: "Marcar como contatado", generate: "Gerar", regenerate: "Gerar novamente", reviewStatus: "Status da revisão", language: "Idioma do email", tone: "Tom", service: "Serviço", subject: "Assunto", body: "Corpo", reviewNotes: "Notas da revisão", supportingEvidence: "Evidências usadas", noEvidence: "A personalização é limitada porque não há evidências pontuadas disponíveis.", activeModel: "Modelo ativo", priorOutreach: "outreach anterior", drafts: "rascunhos", noEmail: "Nenhum email registrado", translation: "Tradução para português",
    notGenerated: "Não gerado", draft: "Rascunho", reviewed: "Revisado", contacted: "Contatado", replied: "Respondeu", interested: "Interessado", english: "Inglês", professional: "Profissional", warm: "Próximo", direct: "Direto", consultative: "Consultivo", optional: "Opcional", name: "Nome", role: "Cargo", company: "Empresa", website: "Site", contact: "Informações de contato", enabled: "Ativado", disabled: "Desativado",
    refresh: "Atualizar", import: "Importar", newSearch: "Nova pesquisa", dismiss: "Dispensar", prospectingWorkspace: "Espaço de prospecção", buildTargetedSearch: "Criar pesquisa direcionada", yourTerritoryInFocus: "Seu território em foco.", allImportedLeads: "Todos os seus leads importados", localWorkspace: "Espaço local", connected: "Conectado", notConnected: "Não conectado", loading: "Carregando…", requestFailed: "Falha na requisição.", failed: "Requer atenção", countryDirectoryUnavailable: "O diretório de países está indisponível.", industryCatalogUnavailable: "O catálogo de indústrias está indisponível.", workspaceSettingsUnavailable: "As configurações do espaço estão indisponíveis.", cancel: "Cancelar", canceled: "Cancelado", cancelled: "Cancelado", close: "Fechar", details: "Detalhes", more: "Mais", actions: "Ações", previous: "Anterior", next: "Próximo", resetFilters: "Redefinir filtros", noFilters: "Nenhum filtro avançado aplicado", filtersActive: "filtros ativos",
    searchScope: "Escopo da pesquisa", searchScopeHelp: "Priorize regiões ou alterne para cobertura nacional e por cidade.", territoryShortcuts: "Atalhos de território", usa: "EUA", canada: "Canadá", europe: "Europa", worldwide: "Mundo todo", entireCountry: "País inteiro", distributedKnownRegions: "Distribuído entre regiões conhecidas", selectedRegions: "Regiões selecionadas", preferredOneJobRegion: "Preferencial · um job por região", selectedCities: "Cidades selecionadas", oneJobCity: "Um job independente por cidade", savedSearchName: "Nome da pesquisa salva", country: "País", required: "obrigatório", stateProvinceRegion: "Estado / província / região", city: "Cidade", uniqueLeadTarget: "Meta de leads únicos", leadQualification: "Qualificação de leads", advancedSearchTerms: "Termos de pesquisa avançados", selected: "Selecionados", add: "Adicionar", searchIndustries: "Buscar indústrias…", relatedTerms: "Termos relacionados", searchCandidatesNote: "Os termos relacionados do Google Maps são expandidos automaticamente. São candidatos de descoberta, não categorias oficiais.",
    currentTerritory: "Território atual", leadsStored: "Leads armazenados", missingWebsites: "Sites ausentes", qualified: "Qualificados", extracting: "Extraindo", searchActivity: "Atividade de pesquisa", searchActivityHelp: "Progresso do servidor da coleta atual ou mais recente.", newSearchActivity: "Nenhuma atividade de pesquisa ainda", startTargetedSearch: "Inicie uma pesquisa direcionada para acompanhar a coleta aqui.", jobsComplete: "jobs concluídos", discovered: "descobertos", processed: "processados", uniqueLeads: "leads únicos", existingDuplicates: "duplicados existentes", alreadyStored: "já armazenados", repeatedInRun: "repetidos nesta execução", noLeadsMatch: "Nenhum lead corresponde a esta visualização", noLeadsMatchHelp: "Tente alterar a pesquisa ou os filtros avançados.",
    overview: "Visão geral", intelligence: "Inteligência", contacts: "Contatos", outreach: "Outreach", history: "Histórico", icp: "ICP", allCampaigns: "Todas as campanhas", researchCampaign: "Campanha de pesquisa", runResearch: "Executar pesquisa", openLeads: "Abrir leads", campaignStatistics: "Estatísticas da campanha", searchConfiguration: "Configuração da pesquisa", runsActivity: "Execuções e atividade", noRuns: "Nenhuma execução registrada ainda.", campaignLeadsHelp: "Membros distintos da campanha, vinculados aos registros globais de Todos os leads.", openFullLeads: "Abrir espaço completo de Leads", noCampaignLeads: "Nenhum lead foi importado para esta campanha ainda.", researchWorkspaces: "Espaços de pesquisa", campaignIndexHelp: "Cada pesquisa salva do Google Maps se torna uma campanha de pesquisa persistente.", newCampaign: "Nova campanha", activeCampaigns: "Campanhas ativas", uniqueMemberships: "Vínculos únicos", contactsFound: "Contatos encontrados", highIcp: "ICP alto", searchCampaigns: "Buscar campanhas", allStatuses: "Todos os status", saved: "Salva", completed: "Concluída", withErrors: "Com erros", noCampaigns: "Nenhuma campanha encontrada", noCampaignsHelp: "Crie uma pesquisa salva para iniciar uma campanha.",
    cohortBuilder: "Construtor de coortes", persistedSegmentation: "Segmentação por evidências persistidas", cohortHelp: "Coortes dinâmicas são atualizadas apenas com dados existentes de leads, contatos, sinais e ICP.", newCohort: "Nova coorte", chooseField: "Escolha um campo", remove: "Remover", condition: "+ Condição", nestedGroup: "+ Grupo aninhado", present: "Presente", missingEvidence: "Evidência ausente", verifiedContact: "Contato verificado", value: "Valor", whyCondition: "Por que esta condição", searchCohorts: "Buscar coortes", matchingLeads: "Leads correspondentes", dynamicMatches: "correspondências dinâmicas", noEnrichmentHere: "sem enriquecimento ou scraping aqui", matchedByConditions: "Correspondência pelas condições da coorte", saveCohort: "Salvar coorte", duplicate: "Duplicar", delete: "Excluir", createCampaignFromCohort: "Criar campanha a partir da coorte", applyMatches: "Aplicar correspondências", leadsAddedToCampaign: "leads adicionados à campanha.",
    localConnection: "Conexão local", scoutEngine: "Scout Engine", engineOnline: "Motor conectado", engineOffline: "Motor desconectado", engineChecking: "Verificando motor…", contactDiscovery: "Descoberta de contatos", automaticContactDiscovery: "Descoberta automática de contatos", websiteIntelligence: "Inteligência de sites", automaticHomepageAudits: "Auditorias automáticas da página inicial", chatgptPlan: "Plano ChatGPT", continueWithChatGPT: "Continuar com ChatGPT", switchChatGPTAccount: "Trocar conta do ChatGPT", chatgptSwitchHelp: "Uma nova janela de autorização pedirá o login da conta desejada.", disconnect: "Desconectar", refreshAvailableModels: "Atualizar modelos disponíveis", selectModel: "Selecione um modelo", activeOutreachModel: "Modelo ativo do Outreach", selectedModel: "Modelo selecionado", modelDiscoveryFailed: "Falha ao descobrir modelos. Verifique a conexão e atualize; nenhum modelo foi selecionado.",
    icpProfiles: "Perfis de pontuação ICP", dataPolicy: "Política de dados", skillContent: "Conteúdo da skill", localOverlay: "Camada local", savedLocally: "Salvo localmente.", noPublicContacts: "Nenhuma pessoa ou contato público salvo. Isso não prova que a empresa não tenha contatos.", verifiedPublic: "Público verificado", unverified: "Não verificado", publicConfirmationNote: "A confirmação pública não implica que a caixa de email seja entregável.",
    notAnalyzed: "Não analisado", analyzing: "Analisando", auditFailed: "Falha na auditoria", insufficientEvidence: "Evidência insuficiente", awaitingAudit: "Aguardando auditoria do site", locationUnavailable: "Localização indisponível", dateUnavailable: "Data indisponível", unknownSource: "Fonte desconhecida", source: "Fonte", callBusiness: "Ligar para a empresa", viewHomepageAudit: "Ver auditoria da página inicial", contactSource: "Fonte do contato", searchManually: "Pesquisar manualmente", addToPipeline: "Adicionar ao pipeline", inPipeline: "No pipeline", visitWebsite: "Visitar site", noCommercialNotes: "Nenhuma nota comercial ainda", recordedActivity: "Atividade registrada", noActivity: "Ainda não há atividade persistida para este lead.", businessSummary: "Resumo da empresa", quickActions: "Ações rápidas", businessContacts: "Contatos da empresa", publicPeopleContactPoints: "Pessoas e pontos de contato públicos", leadWorkspace: "Espaço do lead", leadSummary: "Resumo do lead", rating: "Avaliação", websiteQuality: "Qualidade do site", websiteOpportunity: "Oportunidade no site", business: "Empresa", evidenceBasedScores: "Pontuações de oportunidade baseadas em evidências", notScored: "Ainda não pontuado.", persistedHomepageSignals: "Sinais persistidos da página inicial", noPersistedFindings: "Nenhum achado persistido ainda. Sinais indisponíveis não são tratados como negativos.",
    toContact: "A contatar", proposalSent: "Proposta enviada", won: "Ganho", lost: "Perdido", allStages: "Todas as etapas", allChannels: "Todos os canais", allIndustries: "Todas as indústrias", allOpportunities: "Todas as oportunidades", noWebsite: "Sem site", needsReview: "Revisar", needsRedesign: "Precisa de redesign", brokenUx: "UX com problema", reviewLater: "Revisar depois", searchPipeline: "Buscar no pipeline", pipelineBoard: "Quadro", pipelineList: "Lista", addActivity: "Adicionar atividade", channel: "Canal", notes: "Notas", lastContact: "Último contato", followUp: "Follow-up", saveChanges: "Salvar alterações",
    emailCopied: "Email copiado para a área de transferência.", couldNotCopyEmail: "Não foi possível copiar o email.", noEmailRecorded: "Nenhum email registrado", searchCancellationRequested: "Cancelamento solicitado. Os leads coletados foram preservados.", auditCancelled: "Auditoria cancelada.",
    uiCoverage: "cobertura",
    languageRegion: "Idioma e região", languageRegionHelp: "Escolha separadamente o idioma da interface e o idioma padrão dos e-mails comerciais.", englishUs: "Inglês (Estados Unidos)", portugueseBr: "Português (Brasil)", saveLanguageRegion: "Salvar idioma dos e-mails", languageRegionUnsaved: "O idioma dos e-mails tem alterações não salvas.",
    searchLocation: "Localização", searchLocationHelp: "Onde você deseja encontrar empresas?", shortcuts: "Atalhos", searchCountryPlaceholder: "Digite o nome do país", noCountryFound: "Nenhum país encontrado.", selectCountry: "Selecione um país nas sugestões.", selectEuropeanCountry: "Escolha um país europeu.", noRegionFound: "Nenhuma região encontrada.", selectRegionFirst: "Selecione um estado antes de escolher a cidade.", noCityFound: "Nenhuma cidade encontrada para esta região.", regionsJobs: "Regiões selecionadas · {count} jobs", citiesJobs: "Cidades selecionadas · {count} jobs", marketSegment: "Segmento de mercado", marketSegmentHelp: "Que tipo de empresa você procura?", whatToSearch: "O que pesquisar", marketSegmentHint: "Selecione os segmentos que definem sua lista.", advancedTermsHelp: "Use estes termos quando uma categoria precisar de contexto adicional. Eles serão combinados com o segmento selecionado.", customCategory: "Categoria manual opcional", customCategoryHint: "Use quando o catálogo não for adequado", targetHeading: "Meta da pesquisa", targetHelp: "A meta considera empresas qualificadas, não apenas descobertas.", qualifiedTarget: "Meta de leads qualificados", qualifiedOption: "{count} qualificados", qualifiedTargetHelp: "Apenas leads que passam pela qualificação entram na meta.", searchSummary: "Resumo da pesquisa", searchSummaryHelp: "Confira a configuração antes de continuar.", notSelected: "Não selecionado", coverage: "Cobertura", countryWide: "País inteiro", noSelection: "Nenhuma seleção", segments: "Segmentos", noSegment: "Nenhum segmento", regionsShort: "Regiões", citiesShort: "Cidades", estimatedJobs: "Jobs estimados", qualifiedGoal: "Meta qualificada", selectSegment: "Selecione um segmento.", addRegionHint: "Adicione uma região.", addCityHint: "Adicione uma cidade.", saveForLater: "Salvar para depois", startSearch: "Iniciar pesquisa", resultsInCampaigns: "Os resultados ficarão disponíveis em Campanhas.", regionalJobs: "jobs regionais", jobsByRegion: "{count} jobs por região", jobsByCity: "{count} jobs por cidade", noStateFirst: "Selecione um estado primeiro.",
    newSearchSubtitle: "Defina o mercado e encontre novas oportunidades de negócio.", crmSubtitle: "Acompanhe seus contatos e oportunidades de negócio.", campaignEmails: "Envios da campanha", campaignEmailsHelp: "Gere e revise os rascunhos abaixo; depois prepare uma agenda segura de envios.",
    outboxPendingReview: "Aguardando revisão", outboxApproved: "Agendado", outboxSending: "Enviando", outboxSent: "Enviado", outboxRejected: "Rejeitado", outboxCancelled: "Cancelado", outboxFailed: "Falhou", outboxWaitingActivation: "Bloqueado até ativar o envio", outboxPaused: "Pausado globalmente", outboxWaitingSchedule: "Aguardando horário programado", outboxReady: "Pronto para envio", outboxProcessing: "Processando agora", outboxTerminal: "Encerrado", sendingEnabled: "Envio habilitado", sendingDisabled: "Envio desativado", resume: "Retomar", pause: "Pausar", noConnectedAccounts: "Nenhuma conta conectada. Conecte uma conta em Configurações.", scheduledCount: "Agendadas", sentCount: "Enviadas", failedCount: "Falhas", searchRecipient: "Buscar destinatário ou assunto", filterStatus: "Filtrar status", removeSelected: "Remover selecionados", recipient: "Para", account: "conta", attemptsOne: "{count} tentativa", attemptsOther: "{count} tentativas", uncertainResult: "resultado incerto", testMessage: "Teste · ", unavailableState: "Estado indisponível", noSubject: "Sem assunto", sentAt: "Enviado em {date}", plannedFor: "Envio previsto para {date}", approve: "Aprovar", chooseForRemoval: "Selecionar {subject} para remoção", dailyLimit: "Limite {count}/dia", sendPermissionPending: "Permissão de envio pendente", onlyEnableSendingBackend: "Habilite o envio no backend somente após a validação", couldNotLoadSends: "Não foi possível carregar a atividade de envios.", couldNotUpdateSchedule: "Não foi possível atualizar o agendamento.", couldNotClearSelected: "Não foi possível limpar os itens selecionados.", sendingRemainsDisabled: "O backend mantém o envio desativado até uma autorização explícita.", couldNotChangePause: "Não foi possível alterar a pausa global.", removedOutboxItems: "{count} itens removidos da fila de envios.",
    createTestEmail: "Criar e-mail de teste", testEmailHelp: "O destinatário precisa estar previamente autorizado no backend. O envio permanece bloqueado.", senderAccount: "Conta remetente", authorizedRecipient: "Destinatário autorizado", message: "Mensagem", noTestRecipients: "Nenhum destinatário de teste autorizado. Configure", inBackend: "no backend.", testEmailReview: "Será criado como Aguardando revisão e passará pelo mesmo controle de envios.", prepareSending: "Preparar envio", prepareSendingHelp: "Selecione rascunhos prontos e configure uma agenda. Nenhum envio será iniciado agora.", quantity: "Quantidade", messageInterval: "Intervalo entre mensagens", minutes: "{count} minutos", oneHour: "1 hora", optionalStart: "Início (opcional)", senderAccounts: "Contas remetentes", connectAccountFirst: "Conecte uma conta em Configurações antes de agendar.", availableMessages: "Mensagens disponíveis", selectedCount: "{count} selecionadas", noEligibleMessages: "Não há mensagens com destinatário elegível nesta campanha.", gateWillVerify: "O controle continuará verificando destinatários, duplicações e permissões no backend.", preparing: "Preparando…", addToSendingQueue: "Adicionar à fila de envios", couldNotPrepareSchedule: "Não foi possível preparar o agendamento.", couldNotPrepareQueue: "Não foi possível preparar a fila de envios.", reconnectToSend: "Reconexão necessária para permissão de envio", sendingStillDisabled: "O envio continua desativado.", couldNotLoadTestRecipients: "Não foi possível carregar os destinatários de teste.", testPrepared: "Mensagem de teste preparada na fila de envios. Nenhuma mensagem foi transmitida.", couldNotPrepareTest: "Não foi possível preparar a mensagem de teste.", sendingAuthorized: "envio autorizado", reconnectRequired: "reconexão necessária", prepareTest: "Preparar teste", testSubjectDefault: "Mensagem de teste — Scout", testBodyDefault: "Mensagem de teste do Scout.",
    skippedMessages: "{count} ignoradas: {reasons}", stagedMessages: "{count} mensagens preparadas na fila de envios.",
    generationProcessed: "leads processados", generationComplete: "concluídos", generationFailed: "falharam", cancelGeneration: "Cancelar geração", retry: "Tentar novamente", generationRemainingCancelled: "A geração restante foi cancelada.", generationPartial: "Alguns e-mails não puderam ser gerados. Os rascunhos concluídos foram preservados.", generationSaved: "Rascunhos personalizados salvos.", generationPreparing: "Preparando rascunhos com inteligência verificada dos leads.", couldNotLoadSendAccounts: "Não foi possível carregar as contas de envio.",
    campaignsShown: "Exibindo {count} campanhas", connectedAccountOne: "{count} conta conectada", connectedAccountOther: "{count} contas conectadas", recoveryPreview: "Prévia: {audits} auditorias elegíveis e {contacts} descobertas de contato elegíveis. Sites com acesso restrito são excluídos. Iniciar reprocessamento?", recoveryQueued: "{audits} auditorias e {contacts} descobertas foram enfileiradas.", qualificationProgressSummary: "{audits} auditorias · {visual} análises visuais e de UX · {incomplete} incompletas", candidateProgressSummary: "{active} sendo verificados agora · {pending} pendentes · {blocked} com impedimento", batchStatus: "Lote {status}", batchSummary: "{completed}/{total} concluídos · {failed} falharam", evidenceConfidence: "{percent} de confiança", campaignCountOne: "{count} campanha", campaignCountOther: "{count} campanhas",
    cohortSaved: "Coorte salva.", draftSaved: "Rascunho salvo.", contactedInCampaign: "Marcado como contatado nesta campanha. O pipeline global não foi alterado.",
    smartOutreach: "Outreach inteligente", generalOutreach: "Outreach geral",
    notStarted: "Não iniciado",
    leadStatusNew: "Novo", leadStatusReviewing: "Em revisão", leadStatusQualified: "Qualificado", leadStatusArchived: "Arquivado", channelNotSelected: "canal não selecionado",
    searchLeads: "Buscar leads", globalEmails: "E-mails globais", websiteNotListedHelp: "Nenhuma URL de site foi informada no Google Maps. Isso não confirma que a empresa não tenha um site.", industryExample: "Ex.: refrigeração comercial", subjectIdeaExample: "Ideia para {{company}}", structureExample: "Contexto, valor, pergunta", serviceExample: "Desenvolvimento de sites, SEO…", inCrm: "No CRM",
    settingsIntegrationHelp: "Gerencie os serviços conectados ao Scout.", settingsAutomationHelp: "Controle as tarefas automáticas e acompanhe suas filas locais.", settingsProspectingHelp: "Defina a escrita dos rascunhos e a assinatura comercial.", settingsIntelligenceHelp: "Gerencie o conhecimento comercial e os perfis de qualificação.", settingsSecurityHelp: "Armazenamento local, credenciais e exportações.", engineDescription: "Serviço local de descoberta e coleta de empresas.", unavailable: "Indisponível", automationContactHelp: "Enfileira apenas leads recém-importados. Os existentes não são reprocessados.", automationAuditHelp: "Enfileira leads recém-importados com sites públicos; registros existentes permanecem inalterados.", persistentQueue: "Fila local persistente", concurrentDiscoveries: "{count} descobertas simultâneas", browserQueue: "Fila local limitada · evidências somente da página inicial", emailWritingHelp: "Preferências usadas na preparação dos e-mails.", signatureHelp: "Personalize e confira a assinatura dos rascunhos.", signatureEdit: "Editar assinatura e pré-visualização", signatureEmpty: "Sua assinatura aparecerá aqui.", templateHint: "Use {{company}}, {{category}} ou {{city}}.", intelligenceProfilesActive: "{active} ativos de {total} perfis", rulesCountOne: "{count} regra", rulesCountOther: "{count} regras", active: "Ativo", inactive: "Inativo", skillsActive: "{active} ativas · {total} no total", dataStorageHelp: "As exportações usam seu banco SQLite local. O Scout Engine é executado como um serviço local separado.", dataStorageSuffix: "e não é alterado por esta tela.", protectedCredentials: "As credenciais das contas conectadas ficam no armazenamento local protegido da aplicação.", saveSkillFailed: "Não foi possível salvar a skill.",
  },
};

// Compatibility copy for the older inline JSX fragments that are being
// migrated incrementally. Exact matching is intentional: it cannot touch
// business names, URLs, evidence excerpts, drafts or other user content.
export const legacyUiTranslations: Record<string, string> = {
  "No Website Recorded": "Sem site registrado", "No Website Listed": "Sem site listado", "Has Website": "Tem site", "All Businesses": "Todas as empresas", "Has Instagram": "Tem Instagram", "Has Email": "Tem email", "Has Facebook": "Tem Facebook", "Any digital contact": "Qualquer contato digital", "No digital contact": "Sem contato digital", "Verified only": "Somente verificados", "No Website Listed + Has Instagram": "Sem site listado + tem Instagram", "Clear filters": "Limpar filtros", "Website status": "Status do site", "Website intelligence": "Inteligência do site", "All audit statuses": "Todos os status de auditoria", "All opportunities": "Todas as oportunidades", "High opportunity": "Alta oportunidade", "Medium opportunity": "Oportunidade média", "Low opportunity": "Baixa oportunidade", "All contact availability": "Toda disponibilidade de contato", "Verified contacts": "Contatos verificados", "Possible contacts": "Contatos possíveis", "No contacts found": "Nenhum contato encontrado", "All issue severities": "Todas as severidades", "High issues": "Problemas altos", "Medium issues": "Problemas médios", "Low issues": "Problemas baixos", "Minimum score": "Pontuação mínima", "Newest leads": "Leads mais recentes", "Website score: low first": "Pontuação do site: menor primeiro", "Website score: high first": "Pontuação do site: maior primeiro", "ICP score: high first": "Pontuação ICP: maior primeiro", "ICP score: low first": "Pontuação ICP: menor primeiro", "Minimum ICP score": "Pontuação ICP mínima", "Signal code": "Código do sinal", "Min signal confidence": "Confiança mínima do sinal", "Any signal age": "Qualquer idade do sinal", "Observed in 7 days": "Observado em 7 dias", "Observed in 30 days": "Observado em 30 dias", "Observed in 90 days": "Observado em 90 dias", "No matching cities": "Nenhuma cidade correspondente", "Clear cities": "Limpar cidades", "All collected": "Todos coletados", "Qualified only": "Somente qualificados", "Select visible": "Selecionar visíveis", "Clear visible": "Limpar seleção visível", "Bulk actions": "Ações em massa", "No leads yet": "Nenhum lead ainda", "Import or add leads to get started": "Importe ou adicione leads para começar", "Contact discovery": "Descoberta de contatos", "Completed": "Concluído", "Queued": "Na fila", "Searching": "Pesquisando", "Not started": "Não iniciado", "Not Found": "Não encontrado", "Search unavailable": "Pesquisa indisponível", "Low confidence": "Baixa confiança", "Location unavailable": "Localização indisponível", "Date unavailable": "Data indisponível", "Unknown source": "Fonte desconhecida", "Details": "Detalhes", "More": "Mais", "New": "Novo", "Analyzing": "Analisando", "Audit in progress": "Auditoria em andamento", "Retry scheduled": "Nova tentativa agendada", "Audit could not complete": "A auditoria não pôde ser concluída", "More reliable evidence needed": "São necessárias evidências mais confiáveis", "Awaiting website audit": "Aguardando auditoria do site", "No leads match this view": "Nenhum lead corresponde a esta visualização", "Persistent local records, deduplicated by place identifier.": "Registros locais persistentes, deduplicados pelo identificador do local.", "Select a lead": "Selecione um lead", "No model selected": "Nenhum modelo selecionado", "Generating…": "Gerando…", "Translating…": "Traduzindo…", "Connect ChatGPT and select an available model in Settings before generating. Paid API fallback is disabled.": "Conecte o ChatGPT e selecione um modelo disponível em Configurações antes de gerar. O fallback para API paga está desativado.", "Prior outreach exists for this company in another campaign or the global pipeline. Generation is blocked to prevent accidental repetition.": "Já existe outreach para esta empresa em outra campanha ou no pipeline global. A geração foi bloqueada para evitar repetição acidental.", "Mode": "Modo", "Smart Outreach": "Outreach inteligente", "General Outreach": "Outreach geral",  "Batch": "Lote", "complete": "concluído", "failed": "falhou", "Cancel extraction": "Cancelar extração", "Collection completed": "Coleta concluída", "No search activity yet": "Nenhuma atividade de pesquisa ainda", "Start a targeted search to see live collection progress here.": "Inicie uma pesquisa direcionada para acompanhar a coleta aqui.", "No campaigns found": "Nenhuma campanha encontrada", "Create a saved research search to start a campaign.": "Crie uma pesquisa salva para iniciar uma campanha.", "Research workspaces": "Espaços de pesquisa", "Campaigns": "Campanhas", "Active campaigns": "Campanhas ativas", "Unique memberships": "Vínculos únicos", "Contacts found": "Contatos encontrados", "High ICP": "ICP alto", "No runs have been recorded yet.": "Nenhuma execução registrada ainda.", "Campaign leads": "Leads da campanha", "No leads have been imported for this campaign yet.": "Nenhum lead foi importado para esta campanha ainda.", "No public people or contact points are saved. This is not proof that the business has no contacts.": "Nenhuma pessoa ou ponto de contato público salvo. Isso não prova que a empresa não tenha contatos.", "Verification": "Verificação", "Homepage evidence": "Evidência da página inicial", "Recorded activity": "Atividade registrada", "No persisted activity exists for this lead yet.": "Ainda não há atividade persistida para este lead.", "Business summary": "Resumo da empresa", "Quick actions": "Ações rápidas", "Visit website": "Visitar site", "No commercial notes yet": "Nenhuma nota comercial ainda", "Evidence confidence": "Confiança da evidência", "calculated": "calculado", "Profiled pages": "Páginas analisadas", "Desktop": "Desktop", "Mobile": "Mobile", "No persisted findings are stored yet. Unavailable signals are not treated as negative findings.": "Nenhum achado persistido ainda. Sinais indisponíveis não são tratados como negativos.", "Evidence-based opportunity scores": "Pontuações de oportunidade baseadas em evidências", "Not scored yet.": "Ainda não pontuado.", "Not scored for this profile yet. Scoring uses only saved audits, listing data, and observations.": "Ainda não pontuado para este perfil. A pontuação usa apenas auditorias, dados do anúncio e observações salvas.", "Open pipeline": "Abrir pipeline", "This lead has not been added to the pipeline.": "Este lead ainda não foi adicionado ao pipeline.", "Outreach Studio": "Outreach Studio", "No automatic sending is enabled.": "O envio automático não está ativado.", "No public people or contact points are saved.": "Nenhuma pessoa ou ponto de contato público salvo.", "Verified": "Verificado", "Possible": "Possível", "Inconclusive": "Inconclusivo", "Unverified": "Não verificado", "Public confirmation does not imply mailbox deliverability.": "A confirmação pública não implica que a caixa de email seja entregável.", "Save": "Salvar", "Copy": "Copiar", "Generate": "Gerar", "Regenerate": "Gerar novamente", "Mark contacted": "Marcar como contatado", "Review status": "Status da revisão", "Email language": "Idioma do email", "Service": "Serviço", "Subject": "Assunto", "Body": "Corpo", "Review notes": "Notas da revisão", "Supporting evidence": "Evidências usadas", "Portuguese translation": "Tradução para português", "Draft": "Rascunho", "Reviewed": "Revisado", "Contacted": "Contatado", "Replied": "Respondeu", "Interested": "Interessado", "English": "Inglês", "Professional": "Profissional", "Warm": "Próximo", "Direct": "Direto", "Consultative": "Consultivo", "Optional": "Opcional", "Enabled": "Ativado", "Disabled": "Desativado", "Skill content": "Conteúdo da skill", "Save skill": "Salvar skill", "Local overlay": "Camada local", "Data policy": "Política de dados", "Website Intelligence": "Inteligência de sites", "Contact Discovery": "Descoberta de contatos", "Automatic homepage audits": "Auditorias automáticas da página inicial", "Automatic Contact Discovery": "Descoberta automática de contatos", "ICP scoring profiles": "Perfis de pontuação ICP", "ChatGPT plan": "Plano ChatGPT", "Connected": "Conectado", "Not connected": "Não conectado", "Disconnect": "Desconectar", "Continue with ChatGPT": "Continuar com ChatGPT", "Refresh available models": "Atualizar modelos disponíveis", "Select a model": "Selecione um modelo", "Active Outreach model": "Modelo ativo do Outreach", "Selected model": "Modelo selecionado", "New search": "Nova pesquisa", "New campaign": "Nova campanha", "Import": "Importar", "Refresh": "Atualizar", "Dismiss": "Dispensar", "Search": "Pesquisa", "Leads": "Leads", "Settings": "Configurações", "Pipeline": "Pipeline de outreach", "Cohorts": "Coortes", "Dashboard": "Painel",
};

Object.assign(legacyUiTranslations, {
  "Lead view": "Visualização de leads", "All Leads": "Todos os leads", "By Search": "Por pesquisa", "By Industry": "Por indústria", "Advanced filters": "Filtros avançados", "Bulk actions": "Ações em massa", "Select all matching (": "Selecionar todos os correspondentes (", "Export filtered": "Exportar filtrados", "Export all filtered": "Exportar todos os filtrados", "Export selected (": "Exportar selecionados (", "Enrich selected (": "Enriquecer selecionados (", "Enrich Selected (": "Enriquecer selecionados (", "Add to pipeline (": "Adicionar ao pipeline (", "Add to Pipeline (": "Adicionar ao pipeline (", "Audit selected (": "Auditar selecionados (", "Score selected (": "Pontuar selecionados (", "Stop queue": "Parar fila", "Select": "Selecionar", "Clear": "Limpar", "No website recorded": "Nenhum site registrado", "Contact status": "Status do contato", "Opportunity": "Oportunidade", "Audit status": "Status da auditoria", "Automated UX": "UX automatizada", "AI Visual Review": "Revisão visual com IA", "Opportunity explanation": "Explicação da oportunidade", "Outreach pipeline": "Pipeline de prospecção", "No website": "Sem site", "Export CSV": "Exportar CSV", "Loading audit…": "Carregando auditoria…", "Not Analyzed": "Não analisado", "Audit homepage": "Auditar página inicial", "Cancel audit": "Cancelar auditoria", "Audit stages": "Etapas da auditoria", "Retry audit": "Tentar auditoria novamente", "Audit partially completed.": "Auditoria parcialmente concluída.", "Access restricted.": "Acesso restrito.", "Analyze Visual & UX": "Analisar visual e UX", "Re-audit": "Auditar novamente", "ICP scoring": "Pontuação ICP", "Lead Intelligence": "Inteligência do lead", "Improvement opportunities": "Oportunidades de melhoria", "Commercial stage": "Etapa comercial", "Preferred channel": "Canal preferencial", "Not set": "Não definido", "Follow-up date": "Data de acompanhamento", "Activity history": "Histórico de atividades", "Message sent": "Mensagem enviada", "Response received": "Resposta recebida", "Proposal sent": "Proposta enviada", "Note added": "Nota adicionada", "Add activity": "Adicionar atividade", "Loading lead details…": "Carregando detalhes do lead…", "Outreach record": "Registro de prospecção", "No public contact links recorded.": "Nenhum link de contato público registrado.", "Contact confidence:": "Confiança do contato:", "Commercial status is separate from source data and Contact Discovery.": "O status comercial é separado dos dados de origem e da descoberta de contatos.",
  "Run a local browser audit to capture evidence and technical metrics.": "Execute uma auditoria local no navegador para registrar evidências e métricas técnicas.", "Chromium is inspecting the public homepage. Results will appear here automatically.": "O Chromium está analisando a página inicial pública. Os resultados aparecerão aqui automaticamente.", "Contact discovery remains independent of website auditing. Retry only when the stored reason may be transient.": "A descoberta de contatos é independente da auditoria do site. Tente novamente apenas se o motivo registrado puder ser temporário.", "Some technical stages were not analyzed; no missing score is inferred.": "Algumas etapas técnicas não foram analisadas; nenhuma pontuação ausente é inferida.", "Not scored yet. Scoring uses only persisted lead, audit and observation evidence.": "Ainda não pontuado. A pontuação usa apenas evidências persistidas do lead, da auditoria e das observações.", "Not scored for this profile yet. Scoring uses only saved audits, listing data, and observations.": "Ainda não pontuado para este perfil. A pontuação usa apenas auditorias, dados do anúncio e observações salvas.", "No confirmed homepage signals yet. Run or refresh the homepage audit to collect public evidence.": "Ainda não há sinais confirmados da página inicial. Execute ou atualize a auditoria para coletar evidências públicas.", "Reserved for future manual drafts and controlled outreach. No automatic sending is enabled.": "Reservado para rascunhos manuais futuros e prospecção controlada. Nenhum envio automático está ativo.", "Listed in Google Maps; not a confirmed website audit.": "Listado no Google Maps; não é uma auditoria de site confirmada.", "Persistent local records, deduplicated by place identifier.": "Registros locais persistentes, deduplicados pelo identificador do local.", "No leads in this pipeline view": "Nenhum lead nesta visualização do pipeline", "No leads match this view": "Nenhum lead corresponde a esta visualização", "Run a targeted local search or adjust the location filters.": "Execute uma pesquisa local direcionada ou ajuste os filtros de localização.", "Search companies, categories or addresses": "Buscar empresas, categorias ou endereços", "Search leads…": "Buscar leads…", "Add a commercial note": "Adicionar uma nota comercial", "Activity note": "Nota da atividade", "Add note": "Adicionar nota", "Lead details": "Detalhes do lead", "Lead summary": "Resumo do lead", "Lead detail sections": "Seções de detalhes do lead", "Formatted email preview": "Prévia do e-mail formatado", "Search company...": "Buscar empresa...", "Search company": "Buscar empresa", "Filter cities": "Filtrar cidades", "Selected city filters": "Filtros de cidades selecionadas", "Minimum score": "Pontuação mínima", "Minimum ICP score": "Pontuação ICP mínima", "Signal code": "Código do sinal", "Min signal confidence": "Confiança mínima do sinal", "Filter opportunity": "Filtrar oportunidade", "Filter contact availability": "Filtrar disponibilidade de contato", "Advanced lead filters": "Filtros avançados de leads", "ICP scoring profile": "Perfil de pontuação ICP", "Contact value": "Valor do contato", "Contact role": "Cargo do contato", "Desktop website screenshot": "Captura de tela do site no desktop", "Mobile website screenshot": "Captura de tela do site no celular",
  "Page": "Página", "Status": "Status", "complete ·": "concluídos ·", "qualified ·": "qualificados ·", "collected ·": "coletados ·", "pending": "pendentes", "reviews)": "avaliações)", "Discovery:": "Descoberta:", "· Public confirmation does not imply mailbox deliverability.": "· A confirmação pública não garante a entrega de e-mails.", "Automated UX · objective evidence": "UX automatizada · evidência objetiva", "Status:": "Status:", "· observed": "· observado", "· rule:": "· regra:", "AI Visual Review · subjective": "Revisão visual com IA · subjetiva", "redesign potential": "potencial de redesign", "% coverage": "% de cobertura", "% · calculated": "% · calculado", "Analyze Visual &amp; UX": "Analisar visual e UX", "page": "página", "profiled": "analisadas", "Reviewing": "Em revisão", "Archived": "Arquivado", "pipeline leads": "leads no pipeline", "Remove from Pipeline (": "Remover do pipeline (", "Action": "Ação", "Choose": "Escolher", "Source:": "Fonte:", "total": "total",
  "AND": "E", "OR": "OU", "NOT": "NÃO", "group": "grupo", "ICP scoring ·": "Pontuação ICP ·", "· calculated": "· calculado", "· profile v": "· perfil v", "Email": "E-mail",
} satisfies Record<string, string>);

function translateExact(value: string, language: UiLanguage) {
  if (language === "en") return value;
  const legacy = legacyUiTranslations[value];
  if (legacy) return legacy;
  const intelligence = localizeIntelligenceText(language, value);
  return intelligence !== value ? intelligence : localizeIntelligenceStatus(language, value);
}

const originalText = new WeakMap<Text, { source: string; applied: string }>();
const originalAttributes = new WeakMap<Element, Map<string, { source: string; applied: string }>>();

export function localizeDom(language: UiLanguage, scope?: Element) {
  if (typeof document === "undefined") return;
  const root = scope ?? document.querySelector("#root");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const current = node.nodeValue ?? "";
    const value = current.trim();
    if (!value || node.parentElement?.closest("script,style,textarea,pre,code,blockquote,a[href],[data-no-translate],.campaign-row,.campaign-lead-preview,.pipeline-card,.outreach-editor,.contact-card,[contenteditable='true']")) continue;
    const state = originalText.get(node);
    const source = state && state.applied === current ? state.source : current;
    const sourceValue = source.trim();
    const translated = translateExact(sourceValue, language);
    const result = source.replace(sourceValue, translated);
    if (result !== current) node.nodeValue = result;
    originalText.set(node, { source, applied: result });
  }
  root.querySelectorAll<HTMLElement>("input[placeholder],textarea[placeholder],button[title],button[aria-label],input[aria-label],select[aria-label]").forEach((element) => {
    for (const attribute of ["placeholder", "title", "aria-label"] as const) {
      const value = element.getAttribute(attribute);
      if (!value || element.closest("[data-no-translate]")) continue;
      let originals = originalAttributes.get(element);
      if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
      const state = originals.get(attribute);
      const source = state && state.applied === value ? state.source : value;
      const translated = translateExact(source, language);
      if (translated !== value) element.setAttribute(attribute, translated);
      originals.set(attribute, { source, applied: translated });
    }
  });
}

export function createTranslator(language: UiLanguage) {
  return (key: string, values?: Record<string, string | number>) => {
    const source = translations[language]?.[key] ?? translations.en[key] ?? key;
    if (!values) return source;
    return source.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match);
  };
}

export function translateCount(language: UiLanguage, count: number, forms: { one: string; other: string }) {
  const category = new Intl.PluralRules(language === "pt-BR" ? "pt-BR" : "en-US").select(count);
  return createTranslator(language)(forms[category === "one" ? "one" : "other"], { count: formatNumber(count, language) });
}

export function formatPercent(value: number, language: UiLanguage, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", { style: "percent", ...options }).format(value);
}

const outboxStatusKeys: Record<string, string> = { pending_review: "outboxPendingReview", approved: "outboxApproved", sending: "outboxSending", sent: "outboxSent", rejected: "outboxRejected", cancelled: "outboxCancelled", failed: "outboxFailed" };
const outboxDispatchKeys: Record<string, string> = { review: "outboxPendingReview", waiting_for_activation: "outboxWaitingActivation", paused: "outboxPaused", waiting_for_schedule: "outboxWaitingSchedule", ready: "outboxReady", processing: "outboxProcessing", terminal: "outboxTerminal" };
export function localizeOutboxStatus(language: UiLanguage, status: string) { return createTranslator(language)(outboxStatusKeys[status] ?? status.replaceAll("_", " ")); }
export function localizeOutboxDispatch(language: UiLanguage, state: string) { return createTranslator(language)(outboxDispatchKeys[state] ?? "unavailableState"); }

export function localizeStatus(language: UiLanguage, status: string) {
  const key = status.replaceAll("-", "_").replaceAll(" ", "_");
  const map: Record<string, string> = { completed: "completed", completed_with_shortfall: language === "pt-BR" ? "Cobertura esgotada" : "Coverage exhausted", completed_with_errors: language === "pt-BR" ? "Concluída com erros" : "Completed with errors", waiting_for_service: language === "pt-BR" ? "Aguardando Scout Engine" : "Waiting for Scout Engine", qualifying: language === "pt-BR" ? "Qualificando" : "Qualifying", running: language === "pt-BR" ? "Extraindo" : "Extracting", starting: language === "pt-BR" ? "Iniciando" : "Starting", failed: language === "pt-BR" ? "Falhou" : "Failed", cancelled: language === "pt-BR" ? "Cancelada" : "Cancelled", queued: language === "pt-BR" ? "Na fila" : "Queued", not_started: "notStarted", new: "leadStatusNew", reviewing: "leadStatusReviewing", qualified: "leadStatusQualified", archived: "leadStatusArchived", not_contacted: "toContact", contacted: "contacted", replied: "replied", interested: "interested", proposal_sent: "proposalSent", won: "won", lost: "lost" };
  const translated = map[key];
  return translated ? createTranslator(language)(translated) : status.replaceAll("_", " ");
}

export function formatDate(value: string | number | Date, language: UiLanguage, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language === "pt-BR" ? "pt-BR" : "en-US", options).format(new Date(value));
}

export function formatNumber(value: number, language: UiLanguage) {
  return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US").format(value);
}

export function localizeMessage(language: UiLanguage, message: string) {
  const exact: Record<string, string> = language === "pt-BR" ? {
    "Request failed.": "Falha na requisição.", "Email copied to clipboard.": "Email copiado para a área de transferência.", "Could not copy the email.": "Não foi possível copiar o email.", "Country directory is unavailable.": "O diretório de países está indisponível.", "Industry catalog is unavailable.": "O catálogo de indústrias está indisponível.", "Workspace settings are unavailable.": "As configurações do espaço estão indisponíveis.", "Search cancellation requested. Collected leads were preserved.": "Cancelamento solicitado. Os leads coletados foram preservados.", "Campaign archived. Global leads were preserved.": "Campanha arquivada. Os leads globais foram preservados.", "Campaign updated.": "Campanha atualizada.", "Could not update campaign.": "Não foi possível atualizar a campanha.", "Could not cancel search.": "Não foi possível cancelar a pesquisa.", "Could not save interface language.": "Não foi possível salvar o idioma da interface.", "Could not update the scoring profile.": "Não foi possível atualizar o perfil de pontuação.", "Could not save outreach preferences.": "Não foi possível salvar as preferências de outreach.",
  } : {};
  return exact[message] ?? message;
}

const intelligenceCopy: Record<string, string> = {
  "Lead workspace": "Espaço do lead", Rating: "Avaliação", "Website quality": "Qualidade do site", "Website opportunity": "Oportunidade do site",
  Overview: "Visão geral", Website: "Site", Intelligence: "Inteligência", ICP: "ICP", Contacts: "Contatos", Outreach: "Outreach", History: "Histórico",
  "Persisted homepage signals": "Sinais persistidos da página inicial", Verification: "Verificação", "Homepage evidence": "Evidência da página inicial",
  Technology: "Tecnologia", Marketing: "Marketing", Contact: "Contato", Booking: "Agendamento",
  "Website Opportunities": "Oportunidades do site", Discovery: "Descoberta", Profile: "Perfil", People: "Pessoas",
  "Website technology stack": "Tecnologias do site", "Google Ads tag": "Tag do Google Ads", "Google Tag Manager": "Google Tag Manager",
  "Visible contact CTA": "CTA de contato visível", "Contact form": "Formulário de contato", "Contact form URL": "URL do formulário de contato",
  "Nonfunctional CTA": "CTA não funcional", "Broken booking link": "Link de agendamento quebrado", "Schema.org structured data": "Dados estruturados Schema.org",
  "Decision-maker title": "Cargo de decisão", "Likely owner": "Possível proprietário", "Named contact found": "Contato identificado",
  "Broken contact link": "Link de contato quebrado", "Homepage navigation failure": "Falha de navegação na página inicial",
  "Mobile usability issue": "Problema de usabilidade móvel", "Performance issue": "Problema de desempenho", "Technical SEO issue": "Problema técnico de SEO",
  "Robots blocks AI crawlers": "Robots bloqueia crawlers de IA", "Online booking": "Agendamento online", "Company email pattern": "Padrão de email da empresa",
  "Public registry verification": "Verificação em registro público", "Email deliverability status": "Status de entrega do email", "Discovered via search": "Encontrado pela pesquisa",
  "Listed category": "Categoria informada", "Listed location": "Localização informada", "Review count": "Quantidade de avaliações", "Review rating": "Nota das avaliações",
};
export function localizeIntelligenceText(language: UiLanguage, value: string) {
  if (language === "en") return value;
  const normalized = value.replaceAll("_", " ");
  const titleCase = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return intelligenceCopy[value] ?? intelligenceCopy[normalized] ?? intelligenceCopy[titleCase] ?? value;
}

export function localizeIntelligenceStatus(language: UiLanguage, value: string) {
  if (language === "en") return value;
  return ({ verified: "verificado", possible: "possível", inconclusive: "inconclusivo" } as Record<string, string>)[value] ?? value;
}

export function localizeOpportunityLevel(language: UiLanguage, level: string) {
  if (language === "pt-BR") return ({ high: "Alta oportunidade", medium: "Oportunidade média", low: "Baixa oportunidade", insufficient_evidence: "Evidência insuficiente", audit_failed: "Falha na auditoria", not_analyzed: "Não analisado" } as Record<string, string>)[level] ?? level;
  return ({ high: "High opportunity", medium: "Medium opportunity", low: "Low opportunity", insufficient_evidence: "Insufficient evidence", audit_failed: "Audit failed", not_analyzed: "Not analyzed" } as Record<string, string>)[level] ?? level;
}

export function localizeOpportunityReason(language: UiLanguage, reason: string) {
  if (language === "en") return reason;
  if (reason.startsWith("At least two verified")) return "São necessárias pelo menos duas evidências verificadas ou uma evidência de alta severidade para classificar a oportunidade.";
  if (reason.startsWith("Weighted verified homepage issues")) return "Classificação baseada em problemas verificados da página inicial, após remover repetições e limitar o peso por categoria.";
  if (reason.includes("homepage audit is incomplete")) return "A auditoria da página inicial está incompleta; a oportunidade não foi classificada com evidência parcial.";
  if (reason.includes("Access was restricted")) return "O acesso ao site foi restrito; não há evidência completa para classificar a oportunidade.";
  if (reason.includes("No completed homepage audit")) return "Não há uma auditoria concluída da página inicial.";
  return reason;
}

export function localizeOpportunityTerm(language: UiLanguage, value: string) {
  if (language === "en") return value;
  return ({ issue: "problema", issues: "problemas", high: "alta", medium: "média", low: "baixa", accessibility: "acessibilidade", content: "conteúdo", links: "links", mobile: "celular", performance: "desempenho", seo: "SEO", "Audit complete": "Auditoria concluída", "Audit partial": "Auditoria parcial", "Access restricted": "Acesso restrito", "Audit failed": "Falha na auditoria", "Audit in progress": "Auditoria em andamento", "Awaiting audit": "Aguardando auditoria", "Contact verified": "Contato verificado", "Contact possible": "Contato possível", "No verified contact": "Nenhum contato verificado", "Analyzing": "Analisando", "Not analyzed": "Não analisado" } as Record<string, string>)[value] ?? value;
}

export function localizeQualificationStage(language: UiLanguage, stage: string) {
  if (language === "en") return stage.replaceAll("_", " ");
  return ({
    discovered: "Descoberto",
    website_validation: "Validação do site",
    website_audit: "Auditoria do site",
    visual_ux: "Análise visual e UX",
    opportunity: "Avaliação de oportunidade",
    completed: "Concluído",
    queued: "Na fila",
    http_started: "Verificação HTTP",
    browser_started: "Análise no navegador",
    lighthouse_started: "Análise Lighthouse",
    screenshots_started: "Capturas desktop e mobile",
    visual_ux_started: "Análise visual e UX",
    partial: "Auditoria parcial",
    access_restricted: "Acesso restrito",
  } as Record<string, string>)[stage] ?? stage.replaceAll("_", " ");
}

export function localizeQualificationReason(language: UiLanguage, reason: string) {
  if (language === "en") return reason;
  return ({
    "No public website is available for qualification.": "Não há site público disponível para qualificação.",
    "Public website access is restricted.": "O acesso público ao site está restrito.",
    "Website Intelligence is partial.": "A Inteligência do site está parcial.",
    "Waiting for Website Intelligence.": "Aguardando a Inteligência do site.",
    "Website Intelligence did not complete.": "A Inteligência do site não foi concluída.",
    "One or more required Website Intelligence stages are incomplete.": "Uma ou mais etapas obrigatórias da Inteligência do site estão incompletas.",
    "Waiting for Automated UX checks.": "Aguardando as verificações automáticas de UX.",
    "Automated UX checks failed.": "As verificações automáticas de UX falharam.",
    "Waiting for opportunity evaluation.": "Aguardando a avaliação de oportunidade.",
    "All required qualification stages completed.": "Todas as etapas obrigatórias de qualificação foram concluídas.",
  } as Record<string, string>)[reason] ?? reason;
}

// Outreach Studio uses the same UI locale; email-generation language stays separate.
export const outreachTranslations = {
  en: {
    businesses: "Businesses", ready: "ready for preparation", search: "Search businesses", noEmail: "No verified email", selectLanguage: "Choose email language", language: "Email language", tone: "Tone", globalSettings: "Global email settings", senderProfile: "Sender profile", senderProfileHint: "Identity, services, portfolio and signature reused in upcoming generations.", senderName: "Sender name", senderTitle: "Professional title", senderIntroduction: "Short introduction", senderServices: "Services offered", portfolioUrl: "Portfolio URL", instagramUrl: "Instagram URL", fixedSignature: "Fixed application signature", guidance: "Additional notes", guidanceHint: "Example: the visual presentation feels dated. It guides tone; it is not an unverified claim.", autoService: "Automatically suggested focus", useSuggestedFocus: "Use suggested focus", neutralFocus: "Website improvement review", focusEvidence: "Based on verified evidence", focusSubjective: "Based on an approved visual assessment", generate: "Generate email", regenerate: "Regenerate", generateSelected: "Generate selected emails", generatePending: "Generate all pending", cancel: "Cancel generation", edit: "Edit", save: "Save", copySubject: "Copy subject", copyEmail: "Copy email", subject: "Subject", message: "Message", pending: "Pending", generated: "Draft ready", sent: "Sent", markSent: "Mark as sent", generating: "Generating", failed: "Failed", noSelection: "Select a business to prepare an email.", noDraft: "Choose a language and generate a personalized email. The subject and message are created together from available evidence.", emailAvailable: "Email available", noEmailAvailable: "No verified email", selected: "selected", batchProgress: "Generation progress", evidence: "Evidence used", history: "Draft history", professional: "Professional", warm: "Warm", direct: "Direct", consultative: "Consultative", choose: "Choose a language", english: "English", portuguese: "Portuguese", error: "Could not generate the draft.", saveError: "Could not save the draft.", copied: "Copied.", copyError: "Could not copy.", draftStatus: "Draft status", unsaved: "Unsaved changes", editDraft: "Edit draft", noEvidence: "Generation will use a neutral approach: there is not enough verified evidence.", batchNone: "There are no pending leads to generate.", complete: "complete", of: "of",
  },
  "pt-BR": {
    businesses: "Empresas", ready: "prontas para preparo", search: "Buscar empresas", noEmail: "Sem email verificado", selectLanguage: "Selecione o idioma do email", language: "Idioma do email", tone: "Tom", globalSettings: "Configurações globais de e-mail", senderProfile: "Perfil do remetente", senderProfileHint: "Identidade, serviços, portfólio e assinatura reutilizados nas próximas gerações.", senderName: "Nome do remetente", senderTitle: "Título profissional", senderIntroduction: "Apresentação curta", senderServices: "Serviços oferecidos", portfolioUrl: "URL do portfólio", instagramUrl: "URL do Instagram", fixedSignature: "Assinatura fixa do aplicativo", guidance: "Observações adicionais", guidanceHint: "Ex.: a apresentação visual parece datada. Isso orienta o tom; não vira uma afirmação não verificada.", autoService: "Foco sugerido automaticamente", useSuggestedFocus: "Usar foco sugerido", neutralFocus: "Revisão de melhoria do site", focusEvidence: "Baseado em evidências verificadas", focusSubjective: "Baseado em avaliação visual aprovada", generate: "Gerar email", regenerate: "Gerar novamente", generateSelected: "Gerar emails selecionados", generatePending: "Gerar todos os pendentes", cancel: "Cancelar geração", edit: "Editar", save: "Salvar", copySubject: "Copiar assunto", copyEmail: "Copiar email", subject: "Assunto", message: "Mensagem", pending: "Pendente", generated: "Rascunho pronto", sent: "Enviado", markSent: "Marcar como enviado", generating: "Gerando", failed: "Falhou", noSelection: "Selecione uma empresa para preparar um email.", noDraft: "Escolha o idioma e gere um email personalizado. O assunto e a mensagem serão criados juntos a partir das evidências disponíveis.", emailAvailable: "Email disponível", noEmailAvailable: "Sem email verificado", selected: "selecionadas", batchProgress: "Progresso da geração", evidence: "Evidências usadas", history: "Histórico de drafts", professional: "Profissional", warm: "Próximo", direct: "Direto", consultative: "Consultivo", choose: "Escolha um idioma", english: "Inglês", portuguese: "Português", error: "Não foi possível gerar o draft.", saveError: "Não foi possível salvar o draft.", copied: "Copiado.", copyError: "Não foi possível copiar.", draftStatus: "Status do draft", unsaved: "Alterações não salvas", editDraft: "Editar rascunho", noEvidence: "A geração usará uma abordagem neutra: não há evidências verificadas suficientes.", batchNone: "Não há leads pendentes para gerar.", complete: "concluído", of: "de",
  },
} as const;
export function createOutreachCopy(language: UiLanguage) { return outreachTranslations[language]; }
