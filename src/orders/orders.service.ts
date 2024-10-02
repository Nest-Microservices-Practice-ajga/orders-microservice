import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { PRODUCT_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(
    @Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      // 1. Confirm the ids of the products are valid
      const productsIds = createOrderDto.items.map((item) => item.productId);
      const products: any[] = await firstValueFrom(
        this.productsClient.send({ cmd: 'validate_products' }, productsIds),
      );

      // 2. Calculate total values
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;

        return price * orderItem.quantity + acc;
      }, 0);

      const totalItems = createOrderDto.items.reduce(
        (acc, orderItem) => acc + orderItem.quantity,
        0,
      );

      // 3. Create the order
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                quantity: orderItem.quantity,
                productId: orderItem.productId,
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              productId: true,
              quantity: true,
            },
          },
        },
      });
      return {
        ...order,
        OrderItem: order.OrderItem.map((item) => ({
          ...item,
          name: products.find((product) => product.id === item.productId).name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error.message,
      });
    }
  }

  async findAll(ordersPaginationDto: OrderPaginationDto) {
    const totalItems = await this.order.count({
      where: {
        status: ordersPaginationDto.status,
      },
    });
    const currentPage = ordersPaginationDto.page;
    const pageSize = ordersPaginationDto.limit;
    const skip = (currentPage - 1) * pageSize;
    return {
      data: await this.order.findMany({
        skip,
        take: pageSize,
        where: { status: ordersPaginationDto.status },
      }),
      meta: {
        total: totalItems,
        page: currentPage,
        lastPage: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({
      where: {
        id,
      },
      include: {
        OrderItem: {
          select: {
            price: true,
            productId: true,
            quantity: true,
          },
        },
      },
    });
    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
    }
    const productsIds = order.OrderItem.map((item) => item.productId);
    const products: any[] = await firstValueFrom(
      this.productsClient.send({ cmd: 'validate_products' }, productsIds),
    );
    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const order = await this.findOne(changeOrderStatusDto.id);
    if (order.status === changeOrderStatusDto.status) {
      return order;
    }
    return await this.order.update({
      where: {
        id: changeOrderStatusDto.id,
      },
      data: {
        status: changeOrderStatusDto.status,
      },
    });
  }
}
