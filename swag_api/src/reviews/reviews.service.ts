import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { assertCleanText } from '../common/profanity';
import { DatabaseService } from '../database/database.service';

type UploadedReviewFile = {
  filename: string;
};

@Injectable()
export class ReviewsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(userId?: string) {
    await this.ensureReviewTables();

    const rows = await this.databaseService.request<{
      id: string;
      userId: string;
      userName: string;
      productId: string;
      productName: string;
      productImageUrl: string | null;
      rating: number;
      comment: string | null;
      createdAt: Date;
      photoUrls: string | null;
      likeCount: number;
      heartCount: number;
      replyCount: number;
      userLiked: boolean | number;
      userHearted: boolean | number;
      repliesJson: string | null;
    }>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId || null).query(`
        SELECT
          CONVERT(varchar(36), r.review_id) AS id,
          CONVERT(varchar(36), r.user_id) AS userId,
          u.full_name AS userName,
          CONVERT(varchar(36), p.product_id) AS productId,
          p.name AS productName,
          productImage.image_url AS productImageUrl,
          r.rating,
          r.comment,
          r.created_at AS createdAt,
          photos.photoUrls,
          ISNULL(likes.countValue, 0) AS likeCount,
          ISNULL(hearts.countValue, 0) AS heartCount,
          ISNULL(replies.countValue, 0) AS replyCount,
          CASE WHEN userLike.review_id IS NULL THEN 0 ELSE 1 END AS userLiked,
          CASE WHEN userHeart.review_id IS NULL THEN 0 ELSE 1 END AS userHearted,
          replyItems.repliesJson
        FROM REVIEWS r
        INNER JOIN USERS u ON u.user_id = r.user_id
        INNER JOIN PRODUCTS p ON p.product_id = r.product_id
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES pi
          WHERE pi.product_id = p.product_id
          ORDER BY is_primary DESC, display_order ASC
        ) productImage
        OUTER APPLY (
          SELECT STRING_AGG(image_url, '|') AS photoUrls
          FROM REVIEW_PHOTOS rp
          WHERE rp.review_id = r.review_id
        ) photos
        OUTER APPLY (
          SELECT COUNT(*) AS countValue
          FROM REVIEW_REACTIONS rr
          WHERE rr.review_id = r.review_id AND rr.reaction_type = 'like'
        ) likes
        OUTER APPLY (
          SELECT COUNT(*) AS countValue
          FROM REVIEW_REACTIONS rr
          WHERE rr.review_id = r.review_id AND rr.reaction_type = 'heart'
        ) hearts
        OUTER APPLY (
          SELECT COUNT(*) AS countValue
          FROM REVIEW_REPLIES reply
          WHERE reply.review_id = r.review_id
        ) replies
        OUTER APPLY (
          SELECT (
            SELECT
              CONVERT(varchar(36), reply.reply_id) AS id,
              COALESCE(replyUser.full_name, 'A''FRO DRY GOODS') AS userName,
              reply.comment,
              reply.created_at AS createdAt
            FROM REVIEW_REPLIES reply
            LEFT JOIN USERS replyUser ON replyUser.user_id = reply.user_id
            WHERE reply.review_id = r.review_id
            ORDER BY reply.created_at ASC
            FOR JSON PATH
          ) AS repliesJson
        ) replyItems
        LEFT JOIN REVIEW_REACTIONS userLike
          ON userLike.review_id = r.review_id
          AND userLike.user_id = @userId
          AND userLike.reaction_type = 'like'
        LEFT JOIN REVIEW_REACTIONS userHeart
          ON userHeart.review_id = r.review_id
          AND userHeart.user_id = @userId
          AND userHeart.reaction_type = 'heart'
        ORDER BY r.created_at DESC
      `),
    );

    return rows.map((row) => ({
      ...row,
      photos: row.photoUrls ? row.photoUrls.split('|').filter(Boolean) : [],
      replies: row.repliesJson ? JSON.parse(row.repliesJson) : [],
      userLiked: Boolean(row.userLiked),
      userHearted: Boolean(row.userHearted),
    }));
  }

  async detail(reviewId: string, userId?: string) {
    const reviews = await this.list(userId);
    const review = reviews.find((item) => item.id === reviewId);
    if (!review) {
      throw new BadRequestException('Review not found');
    }
    return review;
  }

  async eligibility(userId?: string, productId?: string) {
    if (!userId || !productId) {
      throw new BadRequestException('User and product are required');
    }

    const rows = await this.databaseService.request<{ canReview: boolean | number; reviewed: boolean | number }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId).query(`
          SELECT
            CASE WHEN EXISTS (
              SELECT 1
              FROM ORDERS o
              INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
              INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id
              WHERE o.user_id = @userId
                AND oi.product_id = @productId
                AND (LOWER(os.label) LIKE '%deliver%' OR LOWER(os.label) LIKE '%complete%' OR LOWER(os.label) LIKE '%cancel%')
            ) THEN 1 ELSE 0 END AS canReview,
            CASE WHEN EXISTS (
              SELECT 1 FROM REVIEWS WHERE user_id = @userId AND product_id = @productId
            ) THEN 1 ELSE 0 END AS reviewed
        `),
    );

    return {
      canReview: Boolean(rows[0]?.canReview) && !Boolean(rows[0]?.reviewed),
      reviewed: Boolean(rows[0]?.reviewed),
    };
  }

  async create(body: Record<string, string | undefined>, file?: UploadedReviewFile) {
    await this.ensureReviewTables();

    const userId = body.userId;
    const productId = body.productId;
    const rating = Math.max(1, Math.min(5, Number(body.rating ?? 0)));
    const comment = body.comment?.trim() || null;

    if (!userId || !productId || !rating) {
      throw new BadRequestException('User, product, and rating are required');
    }

    if (comment) {
      assertCleanText(comment, 'Review');
      this.assertWordLimit(comment, 'Review', 100);
    }

    const allowed = await this.eligibility(userId, productId);
    if (!allowed.canReview) {
      throw new BadRequestException(allowed.reviewed ? 'You already reviewed this item' : 'Only delivered or cancelled orders can be reviewed');
    }

    const photoUrl = file ? `/uploads/reviews/${file.filename}` : null;
    const rows = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId)
        .input('rating', sql.TinyInt, rating)
        .input('comment', sql.NVarChar(sql.MAX), comment)
        .input('photoUrl', sql.NVarChar(500), photoUrl).query(`
          SET XACT_ABORT ON;
          BEGIN TRANSACTION;

          DECLARE @reviewId uniqueidentifier = NEWID();

          INSERT INTO REVIEWS (review_id, user_id, product_id, rating, comment, created_at)
          VALUES (@reviewId, @userId, @productId, @rating, @comment, GETDATE());

          IF @photoUrl IS NOT NULL
          BEGIN
            INSERT INTO REVIEW_PHOTOS (review_id, image_url, created_at)
            VALUES (@reviewId, @photoUrl, GETDATE());
          END

          UPDATE p
          SET avg_rating = reviewAverage.avgRating
          FROM PRODUCTS p
          INNER JOIN (
            SELECT product_id, CAST(AVG(CAST(rating AS decimal(3, 2))) AS decimal(3, 2)) AS avgRating
            FROM REVIEWS
            WHERE product_id = @productId
            GROUP BY product_id
          ) reviewAverage ON reviewAverage.product_id = p.product_id;

          COMMIT TRANSACTION;

          SELECT CONVERT(varchar(36), @reviewId) AS id;
        `),
    );

    return { id: rows[0]?.id, created: true };
  }

  async react(reviewId: string, body: { userId?: string; type?: string }) {
    await this.ensureReviewTables();

    const type = body.type === 'heart' ? 'heart' : 'like';
    if (!body.userId) {
      throw new BadRequestException('User is required');
    }

    await this.databaseService.request((request) =>
      request
        .input('reviewId', sql.UniqueIdentifier, reviewId)
        .input('userId', sql.UniqueIdentifier, body.userId)
        .input('type', sql.NVarChar(10), type).query(`
          IF EXISTS (
            SELECT 1 FROM REVIEW_REACTIONS
            WHERE review_id = @reviewId AND user_id = @userId AND reaction_type = @type
          )
          BEGIN
            DELETE FROM REVIEW_REACTIONS
            WHERE review_id = @reviewId AND user_id = @userId AND reaction_type = @type;
          END
          ELSE
          BEGIN
            INSERT INTO REVIEW_REACTIONS (review_id, user_id, reaction_type, created_at)
            VALUES (@reviewId, @userId, @type, GETDATE());
          END
        `),
    );

    return { updated: true };
  }

  async reply(reviewId: string, body: { userId?: string; comment?: string }) {
    await this.ensureReviewTables();

    const comment = body.comment?.trim();
    if (!body.userId || !comment) {
      throw new BadRequestException('User and comment are required');
    }

    assertCleanText(comment, 'Comment');

    await this.databaseService.request((request) =>
      request
        .input('reviewId', sql.UniqueIdentifier, reviewId)
        .input('userId', sql.UniqueIdentifier, body.userId)
        .input('comment', sql.NVarChar(sql.MAX), comment).query(`
          INSERT INTO REVIEW_REPLIES (review_id, user_id, comment, created_at)
          VALUES (@reviewId, @userId, @comment, GETDATE());
        `),
    );

    return { created: true };
  }

  private async ensureReviewTables() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.REVIEW_PHOTOS', 'U') IS NULL
      BEGIN
        CREATE TABLE REVIEW_PHOTOS (
          photo_id uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
          review_id uniqueidentifier NOT NULL,
          image_url nvarchar(500) NOT NULL,
          created_at datetime2(7) NOT NULL DEFAULT GETDATE()
        );
      END

      IF OBJECT_ID('dbo.REVIEW_REACTIONS', 'U') IS NULL
      BEGIN
        CREATE TABLE REVIEW_REACTIONS (
          review_id uniqueidentifier NOT NULL,
          user_id uniqueidentifier NOT NULL,
          reaction_type nvarchar(10) NOT NULL,
          created_at datetime2(7) NOT NULL DEFAULT GETDATE(),
          CONSTRAINT PK_REVIEW_REACTIONS PRIMARY KEY (review_id, user_id, reaction_type)
        );
      END

      IF OBJECT_ID('dbo.REVIEW_REPLIES', 'U') IS NULL
      BEGIN
        CREATE TABLE REVIEW_REPLIES (
          reply_id uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
          review_id uniqueidentifier NOT NULL,
          user_id uniqueidentifier NOT NULL,
          comment nvarchar(max) NOT NULL,
          created_at datetime2(7) NOT NULL DEFAULT GETDATE()
        );
      END
    `);
  }

  private assertWordLimit(value: string, fieldName: string, maxWords: number) {
    const wordCount = value.match(/\S+/g)?.length ?? 0;

    if (wordCount > maxWords) {
      throw new BadRequestException(`${fieldName} must be ${maxWords} words or fewer`);
    }
  }

}
