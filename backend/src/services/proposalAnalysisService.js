import ProposalHistory from "../models/ProposalHistory.js";

/**
 * Analyze text sentiment and tone patterns
 * Returns scores for sentiment, formality, confidence
 */
export const analyzeTonePatterns = (text) => {
  const lowerText = text.toLowerCase();
  
  // Simple sentiment analysis using keyword matching
  const positiveWords = ["excellent", "proven", "strong", "award", "success", "innovative", "passionate", "expert", "proficient", "dedicated"];
  const negativeWords = ["struggle", "limited", "inexperienced", "difficult", "challenged", "weak"];
  
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  // Sentiment score: -1 (negative) to 1 (positive)
  const sentimentScore = positiveCount - negativeCount > 0 
    ? Math.min(positiveCount / (positiveCount + negativeCount + 1), 1)
    : negativeCount > 0 
    ? -Math.min(negativeCount / (positiveCount + negativeCount + 1), 1)
    : 0;

  // Formality: count of formal indicators
  const formalityIndicators = text.match(/\b(regarding|pursuant|furthermore|herein|thereby|consequently|implement|framework|strategic|methodology|synergistic)\b/gi) || [];
  const casualIndicators = text.match(/\b(hey|awesome|cool|gonna|wanna|super|basically|really|like|pretty much)\b/gi) || [];
  const wordCount = text.split(/\s+/).length;
  const formality = Math.min(formalityIndicators.length / (wordCount / 20), 1);

  // Confidence level: indicators of assertiveness
  const confidenceIndicators = text.match(/\b(confident|proven|certainly|guarantee|expert|master|leading|pioneering|award|recognized)\b/gi) || [];
  const hesitationIndicators = text.match(/\b(might|possibly|potentially|somewhat|fairly|somewhat|try|attempt)\b/gi) || [];
  const confidence = (confidenceIndicators.length - (hesitationIndicators.length * 0.5)) / (wordCount / 30);

  // Extract personality keywords (simple approach: adjectives and positive descriptors)
  const personalityPatterns = text.match(/\b(creative|analytical|strategic|collaborative|detail-oriented|problem-solver|self-starter|quick learner|adaptable|innovative)\b/gi) || [];
  const personalityKeywords = [...new Set(personalityPatterns.map(k => k.toLowerCase()))];

  return {
    sentimentScore: Math.max(-1, Math.min(1, sentimentScore)),
    formality: Math.max(0, Math.min(1, formality)),
    confidenceLevel: Math.max(0, Math.min(1, confidence)),
    personalityKeywords
  };
};

/**
 * Analyze proposal structure and format
 */
export const analyzeStructure = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  const words = text.split(/\s+/);
  
  // Detect introduction style (first paragraph)
  const firstParagraph = lines.slice(0, 3).join(' ');
  let introductionStyle = "standard";
  if (firstParagraph.match(/^(hi|hello|dear|greetings)/i)) introductionStyle = "greeting";
  if (firstParagraph.match(/^(i'm|i am)/i)) introductionStyle = "personal";
  if (firstParagraph.match(/^(with|regarding|your)/i)) introductionStyle = "contextual";

  // Detect call-to-action style (last paragraph)
  const lastParagraph = lines.slice(-3).join(' ').toLowerCase();
  let callToActionStyle = "standard";
  if (lastParagraph.match(/connect|discuss|chat|conversation/)) callToActionStyle = "collaborative";
  if (lastParagraph.match(/excited|interested|opportunity/)) callToActionStyle = "enthusiastic";
  if (lastParagraph.match(/available|reach|contact/)) callToActionStyle = "formal";

  return {
    introductionStyle,
    bodyLength: words.length,
    callToActionStyle,
    keyPointsCount: lines.length - 2 // rough estimate
  };
};

/**
 * Get successful proposals for a user to use as context
 */
export const getSuccessfulProposals = async (userId, limit = 3) => {
  try {
    const successfulProposals = await ProposalHistory.find({
      user: userId,
      success: true
    })
      .select("generatedProposal tone jobTitle detectedTonePatterns structureAnalysis userRating")
      .sort({ createdAt: -1, userRating: -1 })
      .limit(limit)
      .lean();

    return successfulProposals;
  } catch (error) {
    console.error("Error fetching successful proposals:", error);
    return [];
  }
};

/**
 * Analyze and extract learning patterns from successful proposals
 */
export const analyzeSuccessPatterns = async (userId) => {
  try {
    const successfulProposals = await ProposalHistory.find({
      user: userId,
      success: true
    })
      .select("tone detectedTonePatterns structureAnalysis userRating")
      .lean();

    if (successfulProposals.length === 0) {
      return null;
    }

    // Aggregate patterns across successful proposals
    const avgTones = {};
    const toneFrequency = {};
    let avgConfidence = 0;
    let avgFormality = 0;
    const allKeywords = [];

    successfulProposals.forEach(proposal => {
      // Track tone usage
      toneFrequency[proposal.tone] = (toneFrequency[proposal.tone] || 0) + 1;

      // Average tone patterns
      if (proposal.detectedTonePatterns) {
        avgConfidence += proposal.detectedTonePatterns.confidenceLevel || 0;
        avgFormality += proposal.detectedTonePatterns.formality || 0;
        allKeywords.push(...(proposal.detectedTonePatterns.personalityKeywords || []));
      }
    });

    const count = successfulProposals.length;
    const mostUsedTone = Object.entries(toneFrequency).sort(([, a], [, b]) => b - a)[0]?.[0] || "professional";
    const topKeywords = allKeywords.length > 0 
      ? Object.entries(allKeywords.reduce((acc, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {}))
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([kw]) => kw)
      : [];

    return {
      successCount: count,
      mostEffectiveTone: mostUsedTone,
      averageConfidence: avgConfidence / count,
      averageFormality: avgFormality / count,
      topPersonalityKeywords: topKeywords,
      recommendations: generateRecommendations({
        confidence: avgConfidence / count,
        formality: avgFormality / count,
        tone: mostUsedTone,
        keywords: topKeywords
      })
    };
  } catch (error) {
    console.error("Error analyzing success patterns:", error);
    return null;
  }
};

/**
 * Generate recommendations based on success patterns
 */
const generateRecommendations = (patterns) => {
  const recommendations = [];

  if (patterns.confidence > 0.7) {
    recommendations.push("Your successful proposals are confident and assertive. Keep showcasing your expertise!");
  } else if (patterns.confidence < 0.3) {
    recommendations.push("Consider being more confident in your proposals. Add evidence of your achievements.");
  }

  if (patterns.formality > 0.7) {
    recommendations.push("Your formal tone is working well. Maintain professional language.");
  } else if (patterns.formality < 0.3) {
    recommendations.push("Your casual tone is effective with this profile. Stay personable!");
  }

  if (patterns.keywords.length > 0) {
    recommendations.push(`Keep using keywords like "${patterns.keywords.slice(0, 3).join('", "')}" in your proposals.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("Your proposals are performing well! Keep up the great work.");
  }

  return recommendations;
};

/**
 * Generate context string from successful proposals for smarter regeneration
 */
export const generateContextFromSuccessful = async (userId) => {
  try {
    const successfulProposals = await getSuccessfulProposals(userId, 2);
    const patterns = await analyzeSuccessPatterns(userId);

    if (!patterns || patterns.successCount === 0) {
      return null;
    }

    let context = `Based on your previous successful proposals:\n\n`;
    
    if (successfulProposals.length > 0) {
      context += `Examples of your successful proposals:\n`;
      successfulProposals.forEach((prop, idx) => {
        context += `\n${idx + 1}. For "${prop.jobTitle}" (Rating: ${prop.userRating || "N/A"}/5):\n`;
        context += `   Tone: ${prop.tone}, Key patterns: ${prop.detectedTonePatterns?.personalityKeywords?.slice(0, 3).join(", ") || "professional approach"}\n`;
      });
    }

    context += `\n\nYour Success Pattern:`;
    context += `\n- Most effective tone: ${patterns.mostEffectiveTone}`;
    context += `\n- Confidence level: ${(patterns.averageConfidence * 100).toFixed(0)}%`;
    context += `\n- Formality level: ${(patterns.averageFormality * 100).toFixed(0)}%`;
    context += `\n- Key strengths: ${patterns.topPersonalityKeywords?.slice(0, 3).join(", ") || "professionalism and expertise"}`;
    context += `\n\nAdapt the new proposal to match these successful patterns.`;

    return {
      context,
      suggestedTone: patterns.mostEffectiveTone,
      patterns
    };
  } catch (error) {
    console.error("Error generating context:", error);
    return null;
  }
};

/**
 * Save proposal to history with pattern analysis
 */
export const saveProposalToHistory = async (
  userId,
  jobId,
  jobTitle,
  generatedProposal,
  tone = "professional",
  userSkillsCount = 0,
  skillMatchPercentage = 0,
  jobRequirementsCount = 0
) => {
  try {
    const tonePatterns = analyzeTonePatterns(generatedProposal);
    const structure = analyzeStructure(generatedProposal);

    const proposalHistory = new ProposalHistory({
      user: userId,
      jobId,
      jobTitle,
      generatedProposal,
      tone,
      detectedTonePatterns: tonePatterns,
      structureAnalysis: structure,
      generationContext: {
        userSkillsCount,
        skillMatchPercentage,
        jobRequirementsCount
      }
    });

    await proposalHistory.save();
    return proposalHistory._id;
  } catch (error) {
    console.error("Error saving proposal to history:", error);
    throw error;
  }
};

/**
 * Mark a proposal as successful
 */
export const markProposalSuccess = async (proposalHistoryId, successReason = null, userRating = null) => {
  try {
    const updated = await ProposalHistory.findByIdAndUpdate(
      proposalHistoryId,
      {
        success: true,
        successReason,
        userRating
      },
      { new: true }
    );

    return updated;
  } catch (error) {
    console.error("Error marking proposal as successful:", error);
    throw error;
  }
};
