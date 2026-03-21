/**
 * LeetCode GraphQL API Wrapper
 * 封装 LeetCode.cn 的 GraphQL 接口调用
 */

const LC_GRAPHQL_URL = 'https://leetcode.cn/graphql/';
const LC_NOJGO_URL = 'https://leetcode.cn/graphql/noj-go/';

/**
 * 通用 GraphQL 请求
 */
async function lcGraphQL(url, query, variables = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!resp.ok) throw new Error(`LeetCode API error: ${resp.status}`);
  return resp.json();
}

/**
 * 获取题目列表（分页）
 * @param {number} skip - 跳过多少题
 * @param {number} limit - 每页数量
 * @returns {Promise<Object>} 题目列表数据
 */
export async function fetchProblemList(skip = 0, limit = 50) {
  const query = `
    query problemsetQuestionListV2(
      $filters: QuestionFilterInput, $limit: Int, $skip: Int,
      $sortBy: QuestionSortByInput, $categorySlug: String
    ) {
      problemsetQuestionListV2(
        filters: $filters, limit: $limit, skip: $skip,
        sortBy: $sortBy, categorySlug: $categorySlug
      ) {
        questions {
          id
          titleSlug
          title
          translatedTitle
          questionFrontendId
          difficulty
          topicTags { name slug nameTranslated }
          status
          acRate
        }
        totalLength
        hasMore
      }
    }`;
  const variables = {
    categorySlug: 'all-code-essentials',
    skip,
    limit,
    filters: {
      filterCombineType: 'ALL',
      statusFilter: { questionStatuses: [], operator: 'IS' },
      difficultyFilter: { difficulties: [], operator: 'IS' }
    },
    sortBy: { sortField: 'FRONTEND_ID', sortOrder: 'ASCENDING' }
  };
  return lcGraphQL(LC_GRAPHQL_URL, query, variables);
}

/**
 * 获取用户已通过的所有题目列表
 * @returns {Promise<Object>} 已通过题目列表
 */
export async function fetchAcceptedProblems(skip = 0, limit = 100) {
  const query = `
    query problemsetQuestionListV2(
      $filters: QuestionFilterInput, $limit: Int, $skip: Int,
      $sortBy: QuestionSortByInput, $categorySlug: String
    ) {
      problemsetQuestionListV2(
        filters: $filters, limit: $limit, skip: $skip,
        sortBy: $sortBy, categorySlug: $categorySlug
      ) {
        questions {
          id
          titleSlug
          title
          translatedTitle
          questionFrontendId
          difficulty
          topicTags { name slug nameTranslated }
          status
          acRate
        }
        totalLength
        hasMore
      }
    }`;
  const variables = {
    categorySlug: 'all-code-essentials',
    skip,
    limit,
    filters: {
      filterCombineType: 'ALL',
      statusFilter: { questionStatuses: ['AC'], operator: 'IS' },
      difficultyFilter: { difficulties: [], operator: 'IS' }
    },
    sortBy: { sortField: 'FRONTEND_ID', sortOrder: 'ASCENDING' }
  };
  return lcGraphQL(LC_GRAPHQL_URL, query, variables);
}

/**
 * 获取某题的提交记录
 * @param {string} titleSlug - 题目 slug
 * @returns {Promise<Object>} 提交记录
 */
export async function fetchSubmissions(titleSlug, offset = 0, limit = 20) {
  const query = `
    query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
      submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
        lastKey
        hasNext
        submissions {
          id
          statusDisplay
          lang
          timestamp
          runtime
          memory
        }
      }
    }`;
  const variables = { questionSlug: titleSlug, offset, limit };
  return lcGraphQL(LC_GRAPHQL_URL, query, variables);
}

/**
 * 获取当前用户信息（检查登录态）
 */
export async function fetchUserProfile() {
  const query = `
    query globalData {
      userStatus {
        isSignedIn
        username
        realName
        avatar
      }
    }`;
  return lcGraphQL(LC_GRAPHQL_URL, query);
}

/**
 * 获取全部已通过的题目（自动分页）
 */
export async function fetchAllAcceptedProblems() {
  const allProblems = [];
  let skip = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchAcceptedProblems(skip, limit);
    const list = data?.data?.problemsetQuestionListV2;
    if (!list || !list.questions || list.questions.length === 0) break;
    allProblems.push(...list.questions);
    hasMore = list.hasMore;
    skip += limit;
  }
  return allProblems;
}

/**
 * 配合 mt.md 路线，获取指定难度或标签的未做题目建议
 */
export async function fetchRecommendedProblems(limit = 3, maxDifficulty = 1700) {
  const query = `
    query problemsetQuestionListV2(
      $filters: QuestionFilterInput, $limit: Int, $skip: Int,
      $sortBy: QuestionSortByInput, $categorySlug: String
    ) {
      problemsetQuestionListV2(
        filters: $filters, limit: $limit, skip: $skip,
        sortBy: $sortBy, categorySlug: $categorySlug
      ) {
        questions {
          id
          titleSlug
          title
          translatedTitle
          questionFrontendId
          difficulty
          topicTags { name slug nameTranslated }
          status
        }
      }
    }`;
  const variables = {
    categorySlug: 'all-code-essentials',
    skip: Math.floor(Math.random() * 200), // 简单随机跳过
    limit: limit * 2,
    filters: {
      filterCombineType: 'ALL',
      statusFilter: { questionStatuses: ['NOT_STARTED'], operator: 'IS' },
      difficultyFilter: { difficulties: ['EASY', 'MEDIUM'], operator: 'IS' }
    },
    sortBy: { sortField: 'FRONTEND_ID', sortOrder: 'ASCENDING' }
  };
  
  const data = await lcGraphQL(LC_GRAPHQL_URL, query, variables);
  const qs = data?.data?.problemsetQuestionListV2?.questions || [];
  return qs.slice(0, limit);
}

