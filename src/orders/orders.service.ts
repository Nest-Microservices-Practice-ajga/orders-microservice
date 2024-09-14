import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  create(createOrderDto: CreateOrderDto) {
    return this.order.create({
      data: createOrderDto,
    });
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
    });
    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
    }
    return order;
  }

  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }
}
